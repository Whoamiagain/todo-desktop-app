import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { initLocalDb, selectSql, executeSql, deleteWeeklyTask } from '../lib/localDb';
import { queueOfflineChange } from '../lib/syncEngine';

type WeeklyRow = {
  id: string;
  user_id: string;
  title: string;
  is_completed: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

function uid(): string {
  try {
    // @ts-ignore
    return (globalThis.crypto && (globalThis.crypto as any).randomUUID && (globalThis.crypto as any).randomUUID()) || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

const WeeklyPage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [tasks, setTasks] = useState<WeeklyRow[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initLocalDb();
        const rows = await selectSql<WeeklyRow>('SELECT * FROM weekly_tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [userId]);
        if (!mounted) return;
        setTasks(rows);
      } catch (e: any) {
        setError(e?.message || 'Failed to load weekly tasks');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const createTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Title required');
    if (!userId) return setError('Not signed in');
    const id = uid();
    const now = new Date().toISOString();
    try {
      await executeSql('INSERT INTO weekly_tasks (id, user_id, title, is_completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, userId, title.trim(), 0, now, now, null]);
      await queueOfflineChange('weekly_tasks', id, 'INSERT', { id, user_id: userId, title: title.trim(), is_completed: 0, created_at: now, updated_at: now }, now);
      setTasks((t) => [{ id, user_id: userId, title: title.trim(), is_completed: 0, created_at: now, updated_at: now }, ...t]);
      setTitle('');
    } catch (e: any) {
      setError(e?.message || 'Failed to create task');
    }
  };

  const toggleCompletion = async (task: WeeklyRow) => {
    if (!userId) return setError('Not signed in');
    const newValue = Number(task.is_completed) === 1 ? 0 : 1;
    const now = new Date().toISOString();
    try {
      await executeSql('UPDATE weekly_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [newValue, now, task.id]);
      await queueOfflineChange('weekly_tasks', task.id, 'UPDATE', { ...task, is_completed: newValue, updated_at: now }, now);
      setTasks((prev) => prev.map((p) => (p.id === task.id ? { ...p, is_completed: newValue, updated_at: now } : p)));
    } catch (e: any) {
      setError(e?.message || 'Failed to update task');
    }
  };

  const deleteTask = async (task: WeeklyRow) => {
    if (!userId) return setError('Not signed in');
    try {
      await deleteWeeklyTask(task.id);
      setTasks((prev) => prev.filter((p) => p.id !== task.id));
    } catch (e: any) {
      setError(e?.message || 'Failed to delete task');
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold">Weekly Tasks</h1>
        <div className="text-sm text-gray-600 mt-1">Resets every Sunday night / Monday at 2:00 AM local time</div>

        <form className="mt-4 flex gap-2" onSubmit={createTask}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New weekly task" className="flex-1 px-3 py-2 border rounded" />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Add</button>
        </form>

        <div className="mt-6">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-600">{error}</div>}

          <ul className="mt-4 space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between border rounded p-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={Number(t.is_completed) === 1} onChange={() => toggleCompletion(t)} />
                  <div className={`select-none ${Number(t.is_completed) === 1 ? 'line-through text-gray-500' : ''}`}>{t.title}</div>
                </div>
                <div>
                  <button
                    type="button"
                    aria-label={`Delete ${t.title}`}
                    title="Delete task"
                    onClick={() => void deleteTask(t)}
                    className="btn-rounded-secondary p-1 text-slate-400 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WeeklyPage;
