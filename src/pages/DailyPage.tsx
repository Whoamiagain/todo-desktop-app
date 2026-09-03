import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { initLocalDb, selectSql, executeSql, serializeArray, parseArray, deleteDailyTask } from '../lib/localDb';
import { getDayOfWeekString } from '../lib/dateUtils';
import TaskProgressBar from '../components/daily/TaskProgressBar';
import { queueOfflineChange } from '../lib/syncEngine';
import { runDailyEvaluation } from '../lib/catchupEngine';

type DailyRow = {
  id: string;
  user_id: string;
  title: string;
  active_days: string;
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

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DailyPage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [tasks, setTasks] = useState<DailyRow[]>([]);
  const [title, setTitle] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  const logicalDow = getDayOfWeekString(new Date());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initLocalDb();
        if (userId) {
          await runDailyEvaluation(userId);
        }

        // fetch all user's daily tasks and filter by active day
        const rows = await selectSql<DailyRow>('SELECT * FROM daily_tasks WHERE user_id = ? AND deleted_at IS NULL', [userId]);
        if (!mounted) return;
        const filtered = rows.filter((r) => parseArray(r.active_days).includes(logicalDow));
        setTasks(filtered);
      } catch (e: any) {
        setError(e?.message || 'Failed to load tasks');
      } finally {
        setLoading(false);
        // clear initial load flag after first render
        setTimeout(() => {
          initialLoadRef.current = false;
        }, 0);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const completedCount = tasks.filter((t) => Number(t.is_completed) === 1).length;
  const totalCount = tasks.length;
  const progress = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

  const toggleDay = (d: string) => {
    setSelectedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const createTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Title is required');
    if (!userId) return setError('Not signed in');
    if (selectedDays.length === 0) return setError('Select at least one day');

    const id = uid();
    const now = new Date().toISOString();
    const payload = {
      id,
      user_id: userId,
      title: title.trim(),
      active_days: serializeArray(selectedDays),
      is_completed: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    try {
      await executeSql('INSERT INTO daily_tasks (id, user_id, title, active_days, is_completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, userId, payload.title, payload.active_days, payload.is_completed, payload.created_at, payload.updated_at, null]);
      await queueOfflineChange('daily_tasks', id, 'INSERT', { ...payload, active_days: JSON.parse(payload.active_days) }, payload.updated_at);

      // if task active for current day, add to state
      if (selectedDays.includes(logicalDow)) {
        setTasks((t) => [...t, payload as unknown as DailyRow]);
      }
      setTitle('');
      setSelectedDays([]);
    } catch (e: any) {
      setError(e?.message || 'Failed to create task');
    }
  };

  const toggleCompletion = async (task: DailyRow) => {
    if (!userId) return setError('Not signed in');
    const newValue = Number(task.is_completed) === 1 ? 0 : 1;
    const now = new Date().toISOString();
    try {
      await executeSql('UPDATE daily_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [newValue, now, task.id]);
      await queueOfflineChange('daily_tasks', task.id, 'UPDATE', { ...task, is_completed: newValue, updated_at: now, active_days: parseArray(task.active_days) }, now);

      setTasks((prev) => prev.map((p) => (p.id === task.id ? { ...p, is_completed: newValue, updated_at: now } : p)));

      // confetti: only trigger if progress reaches 100% due to this user action and not on initial load
      const prevCompleted = completedCount;
      const prevTotal = totalCount;
      const prevProgress = prevTotal === 0 ? 0 : (prevCompleted / prevTotal) * 100;
      const newCompleted = newValue === 1 ? prevCompleted + 1 : prevCompleted - 1;
      const newProgress = prevTotal === 0 ? 0 : (newCompleted / prevTotal) * 100;
      if (!initialLoadRef.current && prevProgress < 100 && newProgress >= 100) {
        try {
          const confetti = (await import('canvas-confetti')).default;
          confetti({ particleCount: 150, spread: 60 });
        } catch {
          // ignore if library missing
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to update task');
    }
  };

  const removeTask = async (task: DailyRow) => {
    if (removingIds.has(task.id)) return;
    setError(null);
    setRemovingIds((current) => new Set(current).add(task.id));

    try {
      await deleteDailyTask(task.id);
      window.setTimeout(() => {
        setTasks((current) => current.filter((item) => item.id !== task.id));
        setRemovingIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }, 180);
    } catch (e: any) {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
      setError(e?.message || 'Failed to delete task');
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold">Daily Tasks</h1>
        <div className="mt-4">
          <TaskProgressBar progress={progress} />
          <div className="text-sm text-gray-600 mt-2">{Math.round(progress)}% complete ({completedCount}/{totalCount})</div>
        </div>

        <form className="mt-6" onSubmit={createTask}>
          <div className="flex gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task title" className="flex-1 px-3 py-2 border rounded" />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Add</button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`px-3 py-1 rounded-md border ${selectedDays.includes(d) ? 'bg-blue-600 text-white' : 'bg-white'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </form>

        <div className="mt-6">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-600">{error}</div>}

          <ul className="mt-4 space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className={`flex items-center justify-between border rounded p-3 transition-all duration-200 ${removingIds.has(t.id) ? 'opacity-0 translate-x-2' : 'opacity-100'}`}>
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-sm text-gray-500">{parseArray(t.active_days).join(', ')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCompletion(t)}
                    className={`px-3 py-1 rounded ${Number(t.is_completed) === 1 ? 'bg-green-500 text-white' : 'bg-gray-100'}`}
                  >
                    {Number(t.is_completed) === 1 ? 'Done' : 'Mark'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${t.title}`}
                    title="Delete task"
                    onClick={() => void removeTask(t)}
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

export default DailyPage;
