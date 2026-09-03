import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { deleteDailyTask, deleteWeeklyTask, executeSql, initLocalDb, parseArray, restoreSoftDeletedTask, selectSql } from '../../lib/localDb';
import { getDayOfWeekString, getLogicalDate } from '../../lib/dateUtils';
import { queueOfflineChange } from '../../lib/syncEngine';
import { useToast } from '../../context/ToastContext';

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

type WeeklyRow = {
  id: string;
  user_id: string;
  title: string;
  is_completed: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

const Sidebar: React.FC<{ onHome?: () => void }> = ({ onHome }) => {
  const { user } = useAuth();
  const { showUndoToast } = useToast();
  const userId = user?.id;

  const [dailyTasks, setDailyTasks] = useState<DailyRow[]>([]);
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const logicalDay = getDayOfWeekString(new Date());
  const logicalDate = getLogicalDate(new Date());

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        await initLocalDb();

        const dailyRows = await selectSql<DailyRow>('SELECT * FROM daily_tasks WHERE user_id = ? AND deleted_at IS NULL', [userId]);
        const activeDaily = dailyRows.filter((task) => parseArray(task.active_days).includes(logicalDay));

        const weeklyRows = await selectSql<WeeklyRow>('SELECT * FROM weekly_tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [userId]);

        if (!mounted) return;
        setDailyTasks(activeDaily);
        setWeeklyTasks(weeklyRows);
      } catch {
        setDailyTasks([]);
        setWeeklyTasks([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [logicalDay, userId]);

  const dailyCompleted = dailyTasks.filter((task) => Number(task.is_completed) === 1).length;
  const dailyProgress = dailyTasks.length === 0 ? 0 : (dailyCompleted / dailyTasks.length) * 100;

  const toggleDailyTask = async (task: DailyRow) => {
    if (!userId) return;

    const newValue = Number(task.is_completed) === 1 ? 0 : 1;
    const now = new Date().toISOString();

    await executeSql('UPDATE daily_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [newValue, now, task.id]);
    await queueOfflineChange('daily_tasks', task.id, 'UPDATE', { ...task, is_completed: newValue, updated_at: now, active_days: parseArray(task.active_days) }, now);

    setDailyTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, is_completed: newValue, updated_at: now } : item)));
  };

  const toggleWeeklyTask = async (task: WeeklyRow) => {
    if (!userId) return;

    const newValue = Number(task.is_completed) === 1 ? 0 : 1;
    const now = new Date().toISOString();

    await executeSql('UPDATE weekly_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [newValue, now, task.id]);
    await queueOfflineChange('weekly_tasks', task.id, 'UPDATE', { ...task, is_completed: newValue, updated_at: now }, now);

    setWeeklyTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, is_completed: newValue, updated_at: now } : item)));
  };

  const removeDailyTask = async (task: DailyRow) => {
    try {
      await deleteDailyTask(task.id);
      const index = dailyTasks.findIndex((item) => item.id === task.id);
      setDailyTasks((prev) => prev.filter((item) => item.id !== task.id));
      showUndoToast('Task deleted', async () => {
        await restoreSoftDeletedTask('daily_tasks', task.id);
        setDailyTasks((current) => current.some((item) => item.id === task.id) ? current : [...current.slice(0, index), task, ...current.slice(index)]);
      });
    } catch {
      // Keep the task visible when the soft delete cannot be persisted.
    }
  };

  const removeWeeklyTask = async (task: WeeklyRow) => {
    try {
      await deleteWeeklyTask(task.id);
      const index = weeklyTasks.findIndex((item) => item.id === task.id);
      setWeeklyTasks((prev) => prev.filter((item) => item.id !== task.id));
      showUndoToast('Task deleted', async () => {
        await restoreSoftDeletedTask('weekly_tasks', task.id);
        setWeeklyTasks((current) => current.some((item) => item.id === task.id) ? current : [...current.slice(0, index), task, ...current.slice(index)]);
      });
    } catch {
      // Keep the task visible when the soft delete cannot be persisted.
    }
  };

  return (
    <aside className="w-80 h-screen sticky top-0 overflow-y-auto bg-slate-900/95 border-r border-slate-800 p-4 flex flex-col gap-5 flex-shrink-0">
      <button type="button" className="btn-rounded-secondary self-start" onClick={onHome}>
        ← Home
      </button>

      <section className="card-blue p-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
          <span>Daily progress</span>
          <span>{Math.round(dailyProgress)}%</span>
        </div>

        <div className="mt-3 h-2.5 w-full bg-slate-700 rounded-full overflow-hidden">
          <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${dailyProgress}%` }} />
        </div>

        <div className="mt-3 text-xs text-slate-300">
          {dailyTasks.length === 0 ? 'No daily tasks today' : `${dailyCompleted} of ${dailyTasks.length} daily tasks done`}
        </div>

        <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
          {logicalDate}
        </div>
      </section>

      <section className="card-blue p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Today</h3>
          <span className="text-[10px] text-slate-400">{logicalDay}</span>
        </div>

        {loading ? (
          <div className="text-xs text-slate-400">Loading…</div>
        ) : dailyTasks.length === 0 ? (
          <div className="text-xs text-slate-400">No tasks scheduled for today.</div>
        ) : (
          <div className="space-y-2">
            {dailyTasks.map((task) => (
              <div key={task.id} className="py-1.5 px-2 text-xs text-slate-200 bg-slate-800/50 rounded-lg flex items-center justify-between gap-2 min-w-0">
                <label className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={Number(task.is_completed) === 1}
                  onChange={() => void toggleDailyTask(task)}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                />
                <span className={`${Number(task.is_completed) === 1 ? 'line-through text-slate-400' : ''} truncate`}>
                  {task.title}
                </span>
                </label>
                <button type="button" title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => void removeDailyTask(task)} className="btn-rounded-secondary shrink-0 p-1 text-slate-400 hover:text-red-400">Delete</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card-blue p-3 mt-auto">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">This week</div>

        {weeklyTasks.length === 0 ? (
          <div className="text-xs text-slate-400">No weekly tasks yet.</div>
        ) : (
          <div className="space-y-2">
            {weeklyTasks.map((task) => (
              <div key={task.id} className="py-1.5 px-2 text-xs text-slate-200 bg-slate-800/50 rounded-lg flex items-center justify-between gap-2 min-w-0">
                <label className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={Number(task.is_completed) === 1}
                  onChange={() => void toggleWeeklyTask(task)}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                />
                <span className={`${Number(task.is_completed) === 1 ? 'line-through text-slate-400' : ''} truncate`}>
                  {task.title}
                </span>
                </label>
                <button type="button" title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => void removeWeeklyTask(task)} className="btn-rounded-secondary shrink-0 p-1 text-slate-400 hover:text-red-400">Delete</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
};

export default Sidebar;
