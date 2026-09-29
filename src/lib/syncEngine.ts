import type { OutboxItem } from '../types';
import { supabase } from './supabase';
import { getActiveCouple, selectSql, executeSql } from './localDb';

export async function queueOfflineChange(tableName: string, recordId: string, action: 'INSERT' | 'UPDATE' | 'DELETE', payload: Record<string, unknown>, updated_at: string): Promise<void> {
  const id = `${Date.now()}-${Math.random()}`;
  const payloadStr = JSON.stringify(payload);
  await executeSql('INSERT INTO outbox_queue (id, table_name, record_id, action, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, tableName, recordId, action, payloadStr, updated_at]);
}

export async function pushLocalChanges(): Promise<void> {
  const activeCouple = await getActiveCouple();
  const rows = await selectSql<OutboxItem>('SELECT id, table_name, record_id, action, payload, updated_at FROM outbox_queue ORDER BY updated_at ASC', []);

  for (const row of rows) {
    const payload = JSON.parse(row.payload || '{}');
    const table = row.table_name;
    const recordId = row.record_id;

    if (table === 'diary_entries') {
      const diaryPayload = payload as { couple_id?: unknown };
      const coupleId = typeof diaryPayload.couple_id === 'string' ? diaryPayload.couple_id : null;
      if (!activeCouple || !coupleId || coupleId !== activeCouple.id) continue;
    }

    // fetch remote updated_at
    const { data: remoteData, error: fetchErr } = await supabase.from(table).select('updated_at').eq('id', recordId).maybeSingle();
    if (fetchErr) {
      // skip this item for now
      continue;
    }

    const remoteUpdatedAt = remoteData?.updated_at as string | undefined;
    const localUpdatedAt = row.updated_at;

    // if remote exists and remote.updated_at > local, skip pushing
    if (remoteUpdatedAt && new Date(remoteUpdatedAt) > new Date(localUpdatedAt)) {
      // remote is newer, so remove the outbox entry (or optionally keep)
      await executeSql('DELETE FROM outbox_queue WHERE id = ?', [row.id]);
      continue;
    }

    // Diary payloads remain encrypted strings; sync never decrypts them.
    const syncResult = row.action === 'DELETE'
      ? await supabase.from(table).delete().eq('id', recordId)
      : table === 'other_tasks'
        ? await supabase.from('other_tasks').upsert(payload as any, { onConflict: 'id' })
        : await supabase.from(table).upsert(payload as any, { onConflict: 'id' });
    if (syncResult.error) {
      // leave in outbox for retry
      continue;
    }

    // delete outbox row on success
    await executeSql('DELETE FROM outbox_queue WHERE id = ?', [row.id]);
  }
}

const REMOTE_TABLES = ['daily_tasks', 'weekly_tasks', 'other_tasks', 'projects', 'project_tasks', 'daily_history'];

async function mergeRemoteRecord(table: string, incoming: Record<string, unknown>): Promise<void> {
  const id = incoming.id as string;
  const incomingUpdatedAt = incoming.updated_at as string | undefined;
  if (!id || !incomingUpdatedAt) return;

  const localRows = await selectSql<{ id: string; updated_at: string }>(
    `SELECT id, updated_at FROM ${table} WHERE id = ?`,
    [id],
  );
  const local = localRows[0];

  if (!local) {
    const columns = Object.keys(incoming);
    const placeholders = columns.map(() => '?').join(', ');
    await executeSql(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      columns.map((column) => incoming[column]),
    );
    return;
  }

  if (new Date(incomingUpdatedAt) <= new Date(local.updated_at)) return;

  const columns = Object.keys(incoming);
  const updates = columns.map((column) => `${column} = ?`).join(', ');
  await executeSql(
    `UPDATE ${table} SET ${updates} WHERE id = ?`,
    [...columns.map((column) => incoming[column]), local.id],
  );
}

export async function pullRemoteChanges(userId: string): Promise<void> {
  // get last pull timestamp
  const meta = await selectSql<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', ['last_pull_timestamp']);
  const lastPull = meta[0]?.value || '1970-01-01T00:00:00Z';

  const newPullTimestamp = new Date().toISOString();

  for (const table of REMOTE_TABLES) {
    const query = table === 'other_tasks'
      ? supabase.from('other_tasks').select('*').gte('updated_at', lastPull).eq('user_id', userId)
      : supabase.from(table).select('*').gte('updated_at', lastPull).eq('user_id', userId);
    const { data, error } = await query;
    if (error) continue;
    if (!data) continue;

    for (const incoming of data as any[]) {
      // History identity is the user's logical date, not the generated row id.
      if (table === 'daily_history') {
        const localRows = await selectSql<{ id: string; updated_at: string }>(
          'SELECT id, updated_at FROM daily_history WHERE user_id = ? AND date = ?',
          [incoming.user_id, incoming.date],
        );
        const local = localRows[0];
        if (!local) {
          const columns = Object.keys(incoming);
          await executeSql(
            `INSERT INTO daily_history (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            columns.map((column) => incoming[column]),
          );
        } else if (incoming.updated_at && new Date(incoming.updated_at) > new Date(local.updated_at)) {
          const columns = Object.keys(incoming);
          await executeSql(
            `UPDATE daily_history SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
            [...columns.map((column) => incoming[column]), local.id],
          );
        }
        continue;
      }

      await mergeRemoteRecord(table, incoming);
    }
  }

  const { data: activeCouple, error: coupleError } = await supabase
    .from('couples')
    .select('*')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .eq('status', 'active')
    .maybeSingle();

  if (!coupleError && activeCouple) {
    await mergeRemoteRecord('couples', activeCouple as Record<string, unknown>);

    const activeCoupleId = activeCouple.id as string;
    const { data: diaryEntries, error: diaryError } = await supabase
      .from('diary_entries')
      .select('*')
      .eq('couple_id', activeCoupleId)
      .gte('updated_at', lastPull);

    if (!diaryError && diaryEntries) {
      for (const entry of diaryEntries as Record<string, unknown>[]) {
        await mergeRemoteRecord('diary_entries', entry);
      }
    }
  }

  // persist new pull timestamp
  await executeSql('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', ['last_pull_timestamp', newPullTimestamp]);
}

export default { queueOfflineChange, pushLocalChanges, pullRemoteChanges };
