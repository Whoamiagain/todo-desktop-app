import Database from '@tauri-apps/plugin-sql';
import type { Couple, DiaryEntry, OtherTask } from '../types';

let db: Database | null = null;

export function isDbInitialized(): boolean {
  return db !== null;
}

function createId(): string {
  const cryptoApi = globalThis.crypto as Crypto & { randomUUID?: () => string };
  return cryptoApi.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

async function queueOtherTaskChange(action: 'INSERT' | 'UPDATE' | 'DELETE', task: OtherTask, updatedAt: string): Promise<void> {
  await executeSql(
    'INSERT INTO outbox_queue (id, table_name, record_id, action, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [createId(), 'other_tasks', task.id, action, JSON.stringify(task), updatedAt],
  );
}

export async function initLocalDb(): Promise<Database> {
  if (db) return db;

  const tauriRuntime = globalThis as typeof globalThis & { __TAURI_INTERNALS__?: unknown };
  if (!tauriRuntime.__TAURI_INTERNALS__) {
    throw new Error('Tauri runtime unavailable. Start the desktop app with "npm run tauri dev".');
  }

  // open/create a local SQLite database file managed by the Tauri SQL plugin
  // using the sqlite URI scheme per plugin conventions
  const connection = await Database.load('sqlite:todo_app.db');

  // Create tables (idempotent)
  const createDaily = `CREATE TABLE IF NOT EXISTS daily_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    active_days TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`;

  const createWeekly = `CREATE TABLE IF NOT EXISTS weekly_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`;

  const createOtherTasks = `CREATE TABLE IF NOT EXISTS other_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`;

  const createProjects = `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_finished INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`;

  const createProjectTasks = `CREATE TABLE IF NOT EXISTS project_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`;

  const createDailyHistory = `CREATE TABLE IF NOT EXISTS daily_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    finished_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    percentage REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`;

  const createCouples = `CREATE TABLE IF NOT EXISTS couples (
    id TEXT PRIMARY KEY,
    user1_id TEXT NOT NULL,
    user2_id TEXT,
    invite_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`;

  const createDiaryEntries = `CREATE TABLE IF NOT EXISTS diary_entries (
    id TEXT PRIMARY KEY,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    encrypted_body TEXT NOT NULL,
    iv TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE(user_id, date)
  );`;

  const createOutbox = `CREATE TABLE IF NOT EXISTS outbox_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`;

  const createMetadata = `CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );`;

  // Execute all creation statements sequentially
  try {
    await connection.execute(createDaily);
    await connection.execute(createWeekly);
    await connection.execute(createOtherTasks);
    await connection.execute(createProjects);
    await connection.execute(createProjectTasks);
    await connection.execute(createDailyHistory);
    await connection.execute(createCouples);
    const coupleColumns = await connection.select('PRAGMA table_info(couples)') as unknown as Array<{ name: string }>;
    if (!coupleColumns.some((column) => column.name === 'status')) {
      await connection.execute("ALTER TABLE couples ADD COLUMN status TEXT DEFAULT 'active'");
    }
    const activeCouples = await connection.select('SELECT id FROM couples WHERE status = ? ORDER BY updated_at DESC') as unknown as Array<{ id: string }>;
    for (const duplicateCouple of activeCouples.slice(1)) {
      await connection.execute('UPDATE couples SET status = ? WHERE id = ?', ['unlinked', duplicateCouple.id]);
    }
    await connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_couples_single_active ON couples(status) WHERE status = 'active'");
    await connection.execute(createDiaryEntries);
    // Older databases may already contain duplicate rows for the same logical day.
    await connection.execute(`
      DELETE FROM daily_history
      WHERE id IN (
        SELECT history.id
        FROM daily_history AS history
        WHERE EXISTS (
          SELECT 1
          FROM daily_history AS newer
          WHERE newer.user_id = history.user_id
            AND newer.date = history.date
            AND (newer.updated_at > history.updated_at
              OR (newer.updated_at = history.updated_at AND newer.id > history.id))
        )
      );
    `);
    await connection.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_history_user_date ON daily_history (user_id, date);');
    await connection.execute(createOutbox);
    await connection.execute(createMetadata);
    db = connection;
    return db;
  } catch (error) {
    try {
      await (connection as any).close();
    } catch {
      // Keep the original initialization error for the retry UI.
    }
    throw error;
  }
}

export function getLocalDb(): Database {
  if (!db) throw new Error('Local DB not initialized - call initLocalDb() first');
  return db;
}

export async function executeSql(sql: string, params: unknown[] = []): Promise<void> {
  const db = getLocalDb();
  await db.execute(sql, params);
}

export async function selectSql<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = getLocalDb();
  const rows = await db.select(sql, params);
  return rows as T[];
}

export async function setDiaryInstalled(enabled: boolean, userId: string): Promise<void> {
  await executeSql('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', ['is_diary_enabled', String(enabled)]);
  if (!enabled) return;

  const diaryTitle = "Write Daily Couple's Diary";
  const existingTask = await selectSql<{ id: string }>(
    'SELECT id FROM daily_tasks WHERE user_id = ? AND title = ? LIMIT 1',
    [userId, diaryTitle],
  );
  if (existingTask.length > 0) return;

  const now = new Date().toISOString();
  await executeSql(
    'INSERT INTO daily_tasks (id, user_id, title, active_days, is_completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [createId(), userId, diaryTitle, '["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]', 0, now, now, null],
  );
}

export async function getActiveCouple(): Promise<Couple | null> {
  const rows = await selectSql<Couple>(
    "SELECT * FROM couples WHERE status = 'active' LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function saveLocalDiaryEntry(entry: DiaryEntry): Promise<void> {
  const activeCouple = await getActiveCouple();
  if (!activeCouple) throw new Error('Cannot create new entry: No active partner linked.');
  entry.couple_id = activeCouple.id;

  await executeSql(
    `INSERT OR REPLACE INTO diary_entries
      (id, couple_id, user_id, date, encrypted_body, iv, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.couple_id, entry.user_id, entry.date, entry.encrypted_body, entry.iv, entry.created_at, entry.updated_at, entry.deleted_at],
  );
}

export async function getLocalDiaryEntries(coupleId: string): Promise<DiaryEntry[]> {
  return selectSql<DiaryEntry>(
    'SELECT * FROM diary_entries WHERE couple_id = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC',
    [coupleId],
  );
}

export async function getAllLocalDiaryEntries(): Promise<DiaryEntry[]> {
  return selectSql<DiaryEntry>('SELECT * FROM diary_entries ORDER BY date ASC');
}

export async function getCoupleRecord(userId: string): Promise<Couple | null> {
  const rows = await selectSql<Couple>(
    'SELECT * FROM couples WHERE user1_id = ? OR user2_id = ? ORDER BY updated_at DESC LIMIT 1',
    [userId, userId],
  );
  return rows[0] ?? null;
}

export async function saveCoupleRecord(couple: Couple): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO couples
      (id, user1_id, user2_id, invite_code, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)` ,
    [couple.id, couple.user1_id, couple.user2_id, couple.invite_code, couple.status ?? 'active', couple.created_at, couple.updated_at],
  );
}

export async function unlinkCoupleLocally(coupleId: string): Promise<void> {
  await executeSql('UPDATE couples SET status = ? WHERE id = ?', ['unlinked', coupleId]);
}

export async function getOtherTasks(userId: string): Promise<OtherTask[]> {
  const rows = await selectSql<Omit<OtherTask, 'is_completed'> & { is_completed: number }>(
    'SELECT * FROM other_tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [userId],
  );

  return rows.map((task) => ({
    ...task,
    is_completed: Boolean(Number(task.is_completed)),
  }));
}

export async function createOtherTask(userId: string, title: string): Promise<OtherTask> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('Task title is required');

  const now = new Date().toISOString();
  const task: OtherTask = {
    id: createId(),
    user_id: userId,
    title: trimmedTitle,
    is_completed: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await executeSql(
    'INSERT INTO other_tasks (id, user_id, title, is_completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [task.id, task.user_id, task.title, 0, task.created_at, task.updated_at, task.deleted_at],
  );
  await queueOtherTaskChange('INSERT', task, now);
  return task;
}

export async function toggleOtherTask(id: string, isCompleted: boolean): Promise<void> {
  const now = new Date().toISOString();
  const rows = await selectSql<Omit<OtherTask, 'is_completed'> & { is_completed: number }>(
    'SELECT * FROM other_tasks WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  const task = rows[0];
  if (!task) throw new Error('Other task not found');

  const updatedTask: OtherTask = {
    ...task,
    is_completed: isCompleted,
    updated_at: now,
  };
  await executeSql('UPDATE other_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [isCompleted ? 1 : 0, now, id]);
  await queueOtherTaskChange('UPDATE', updatedTask, now);
}

export async function deleteOtherTask(id: string): Promise<void> {
  const now = new Date().toISOString();
  const rows = await selectSql<Omit<OtherTask, 'is_completed'> & { is_completed: number }>(
    'SELECT * FROM other_tasks WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  const task = rows[0];
  if (!task) throw new Error('Other task not found');

  const deletedTask: OtherTask = {
    ...task,
    is_completed: Boolean(Number(task.is_completed)),
    updated_at: now,
    deleted_at: now,
  };
  await executeSql('UPDATE other_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  await queueOtherTaskChange('DELETE', deletedTask, now);
}

export async function deleteDailyTask(id: string): Promise<void> {
  const now = new Date().toISOString();
  const rows = await selectSql<{
    id: string;
    user_id: string;
    title: string;
    active_days: string;
    is_completed: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>('SELECT * FROM daily_tasks WHERE id = ? AND deleted_at IS NULL', [id]);
  const task = rows[0];
  if (!task) throw new Error('Daily task not found');

  const payload = {
    ...task,
    active_days: parseArray(task.active_days),
    is_completed: Boolean(Number(task.is_completed)),
    updated_at: now,
    deleted_at: now,
  };
  await executeSql('UPDATE daily_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  await executeSql(
    'INSERT INTO outbox_queue (id, table_name, record_id, action, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [createId(), 'daily_tasks', id, 'DELETE', JSON.stringify(payload), now],
  );
}

export async function deleteWeeklyTask(id: string): Promise<void> {
  const now = new Date().toISOString();
  const rows = await selectSql<{
    id: string;
    user_id: string;
    title: string;
    is_completed: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>('SELECT * FROM weekly_tasks WHERE id = ? AND deleted_at IS NULL', [id]);
  const task = rows[0];
  if (!task) throw new Error('Weekly task not found');

  const payload = {
    ...task,
    is_completed: Boolean(Number(task.is_completed)),
    updated_at: now,
    deleted_at: now,
  };
  await executeSql('UPDATE weekly_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  await executeSql(
    'INSERT INTO outbox_queue (id, table_name, record_id, action, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [createId(), 'weekly_tasks', id, 'DELETE', JSON.stringify(payload), now],
  );
}

export async function restoreSoftDeletedTask(
  tableName: 'daily_tasks' | 'weekly_tasks' | 'project_tasks' | 'other_tasks' | 'projects',
  recordId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = { id: recordId, deleted_at: null, updated_at: now };

  await executeSql(`UPDATE ${tableName} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [null, now, recordId]);
  await executeSql(
    'INSERT INTO outbox_queue (id, table_name, record_id, action, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [createId(), tableName, recordId, 'UPDATE', JSON.stringify(payload), now],
  );
}

// Helpers to convert arrays to JSON strings for storage and parse them back
export function serializeArray(value: string[]): string {
  return JSON.stringify(value);
}

export function parseArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    const validDays = new Map(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => [day.toLowerCase(), day]));
    return [...new Set(
      parsed
        .filter((day): day is string => typeof day === 'string')
        .map((day) => validDays.get(day.trim().toLowerCase()))
        .filter((day): day is string => Boolean(day)),
    )];
  } catch {
    return [];
  }
}

export async function closeLocalDb(): Promise<void> {
  if (!db) return;
  try {
    await (db as any).close();
  } finally {
    db = null;
  }
}
