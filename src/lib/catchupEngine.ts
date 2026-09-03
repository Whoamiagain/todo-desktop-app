import type { DailyTask } from '../types';
import { selectSql, executeSql, parseArray } from './localDb';
import { getLogicalDate, addDays, getDayOfWeekString, isNewWeeklyCycle } from './dateUtils';

function uuid(): string {
  try {
    // modern environments
    // @ts-ignore
    return (globalThis.crypto && (globalThis.crypto as any).randomUUID && (globalThis.crypto as any).randomUUID()) || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

const pendingEvaluations = new Map<string, Promise<void>>();

export function runDailyEvaluation(userId: string): Promise<void> {
  const pending = pendingEvaluations.get(userId);
  if (pending) return pending;

  const evaluation = evaluateDaily(userId).finally(() => {
    pendingEvaluations.delete(userId);
  });
  pendingEvaluations.set(userId, evaluation);
  return evaluation;
}

async function evaluateDaily(userId: string): Promise<void> {
  // fetch last_evaluated_date
  const metadataKey = `last_evaluated_date:${userId}`;
  const metaRows = await selectSql<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', [metadataKey]);
  const lastEvaluated = metaRows[0]?.value;

  const currentLogicalDate = getLogicalDate(new Date());

  if (!lastEvaluated) {
    // initialize
    await executeSql('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', [metadataKey, currentLogicalDate]);
    return;
  }

  if (currentLogicalDate <= lastEvaluated) return;

  // process missed days strictly between lastEvaluated and currentLogicalDate
  let cursor = addDays(new Date(`${lastEvaluated}T12:00:00`), 1);
  const end = addDays(new Date(`${currentLogicalDate}T12:00:00`), 0);

  while (cursor < end) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const dow = getDayOfWeekString(cursor);

    // fetch active daily tasks for user
    const rows = await selectSql<{ id: string; active_days: string }>('SELECT id, active_days FROM daily_tasks WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    const activeTasks = rows.filter((r) => {
      const days = parseArray(r.active_days);
      return days.includes(dow);
    });

    const totalActive = activeTasks.length;
    const finished_count = 0;
    const total_count = totalActive;
    const percentage = totalActive === 0 ? 100.0 : 0.0;

    const id = uuid();
    const now = new Date().toISOString();

    await executeSql(
      'INSERT INTO daily_history (id, user_id, date, finished_count, total_count, percentage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO NOTHING',
      [id, userId, dateStr, finished_count, total_count, percentage, now, now]
    );

    cursor = addDays(cursor, 1);
  }

  // Evaluate lastEvaluated day (the day previous to or equal to currentLogicalDate - 1)
  const lastDate = new Date(`${lastEvaluated}T12:00:00`);
  const lastDow = getDayOfWeekString(lastDate);

  const taskRows = await selectSql<{ id: string; active_days: string; is_completed: number }>('SELECT id, active_days, is_completed FROM daily_tasks WHERE user_id = ? AND deleted_at IS NULL', [userId]);
  const activeForLast = taskRows.filter((r) => parseArray(r.active_days).includes(lastDow));
  const totalActiveLast = activeForLast.length;
  const finishedLast = activeForLast.filter((r) => Number((r as any).is_completed) === 1).length;

  const percentLast = totalActiveLast === 0 ? 100.0 : (finishedLast / totalActiveLast) * 100.0;
  const nowIso = new Date().toISOString();

  // upsert daily_history for lastEvaluated date
  const existing = await selectSql<{ id: string }>('SELECT id FROM daily_history WHERE user_id = ? AND date = ?', [userId, lastEvaluated]);
  if (existing.length > 0) {
    await executeSql(
      'UPDATE daily_history SET finished_count = ?, total_count = ?, percentage = ?, updated_at = ? WHERE id = ? ',
      [finishedLast, totalActiveLast, percentLast, nowIso, existing[0].id]
    );
  } else {
    await executeSql(
      'INSERT INTO daily_history (id, user_id, date, finished_count, total_count, percentage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), userId, lastEvaluated, finishedLast, totalActiveLast, percentLast, nowIso, nowIso]
    );
  }

  // Reset all daily tasks is_completed = false for this user
  await executeSql('UPDATE daily_tasks SET is_completed = 0 WHERE user_id = ?', [userId]);

  // If a new weekly cycle has started, reset weekly tasks
  if (isNewWeeklyCycle(lastEvaluated, currentLogicalDate)) {
    await executeSql('UPDATE weekly_tasks SET is_completed = 0 WHERE user_id = ?', [userId]);
  }

  // persist currentLogicalDate
  await executeSql('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', [metadataKey, currentLogicalDate]);
}

export async function runCatchup(_existingTasks: DailyTask[]): Promise<void> {
  // backward-compatible alias
  return Promise.resolve();
}
