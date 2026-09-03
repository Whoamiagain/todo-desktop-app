import type { OutboxItem } from '../types';
import { supabase } from './supabase';
import { selectSql, executeSql } from './localDb';

export async function queueOfflineChange(tableName: string, recordId: string, action: 'INSERT' | 'UPDATE' | 'DELETE', payload: Record<string, unknown>, updated_at: string): Promise<void> {
  const id = `${Date.now()}-${Math.random()}`;
  const payloadStr = JSON.stringify(payload);
  await executeSql('INSERT INTO outbox_queue (id, table_name, record_id, action, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, tableName, recordId, action, payloadStr, updated_at]);
}

export async function pushLocalChanges(): Promise<void> {
  const rows = await selectSql<OutboxItem>('SELECT id, table_name, record_id, action, payload, updated_at FROM outbox_queue ORDER BY updated_at ASC', []);

  for (const row of rows) {
    const payload = JSON.parse(row.payload || '{}');
    const table = row.table_name;
    const recordId = row.record_id;

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

    // Keep other_tasks explicit so its soft-delete payload follows the same LWW upsert path.
    const { error: upsertErr } = table === 'other_tasks'
      ? await supabase.from('other_tasks').upsert(payload as any, { onConflict: 'id' })
      : await supabase.from(table).upsert(payload as any, { onConflict: 'id' });
    if (upsertErr) {
      // leave in outbox for retry
      continue;
    }

    // delete outbox row on success
    await executeSql('DELETE FROM outbox_queue WHERE id = ?', [row.id]);
  }
}

const REMOTE_TABLES = ['daily_tasks', 'weekly_tasks', 'other_tasks', 'projects', 'project_tasks', 'daily_history'];

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
      const id = incoming.id as string;
      const incomingUpdatedAt = incoming.updated_at as string | undefined;

      let localRows = await selectSql<{ id: string; updated_at: string }>(`SELECT id, updated_at FROM ${table} WHERE id = ?`, [id]);
      let local = localRows[0];

      // History identity is the user's logical date, not the generated row id.
      if (!local && table === 'daily_history') {
        localRows = await selectSql<{ id: string; updated_at: string }>(
          'SELECT id, updated_at FROM daily_history WHERE user_id = ? AND date = ?',
          [incoming.user_id, incoming.date],
        );
        local = localRows[0];
      }

      if (!local) {
        // insert incoming row
        const columns = Object.keys(incoming).join(', ');
        const placeholders = Object.keys(incoming).map(() => '?').join(', ');
        const values = Object.values(incoming);
        await executeSql(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`, values as unknown[]);
        continue;
      }

      const localUpdatedAt = local.updated_at;
      if (!incomingUpdatedAt) continue;
      if (new Date(incomingUpdatedAt) > new Date(localUpdatedAt)) {
        // incoming wins — update local
        const updates = Object.keys(incoming).map((k) => `${k} = ?`).join(', ');
        const values = Object.values(incoming);
        await executeSql(`UPDATE ${table} SET ${updates} WHERE id = ?`, [...(values as unknown[]), local.id]);
      }
    }
  }

  // persist new pull timestamp
  await executeSql('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', ['last_pull_timestamp', newPullTimestamp]);
}

export default { queueOfflineChange, pushLocalChanges, pullRemoteChanges };
