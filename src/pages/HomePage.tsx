import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { deleteDailyTask, deleteWeeklyTask, initLocalDb, executeSql, parseArray, restoreSoftDeletedTask, selectSql, serializeArray } from '../lib/localDb';
import { getDayOfWeekString } from '../lib/dateUtils';
import { queueOfflineChange } from '../lib/syncEngine';
import OtherTasksSection from '../components/tasks/OtherTasksSection';
import { runDailyEvaluation } from '../lib/catchupEngine';
import { useToast } from '../context/ToastContext';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type DailyTaskRow = {
  id: string;
  user_id: string;
  title: string;
  active_days: string;
  is_completed: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

type WeeklyTaskRow = {
  id: string;
  user_id: string;
  title: string;
  is_completed: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

type ProjectRow = {
  id: string;
  user_id: string;
  title: string;
  is_finished: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function uid(): string {
  try {
    // @ts-ignore
    return (globalThis.crypto && (globalThis.crypto as any).randomUUID && (globalThis.crypto as any).randomUUID()) || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

const HomePage: React.FC<{ onOpenProject?: (projectId: string) => void }> = ({ onOpenProject }) => {
  const { user } = useAuth();
  const { showUndoToast } = useToast();
  const userId = user?.id;

  const [dailyTasks, setDailyTasks] = useState<DailyTaskRow[]>([]);
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [dailyTitle, setDailyTitle] = useState('');
  const [dailyDays, setDailyDays] = useState<string[]>([]);
  const [weeklyTitle, setWeeklyTitle] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(true);

  const logicalDay = getDayOfWeekString(new Date());

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        await initLocalDb();
        await runDailyEvaluation(userId);

        const [dailyRows, weeklyRows, projectRows] = await Promise.all([
          selectSql<DailyTaskRow>('SELECT * FROM daily_tasks WHERE user_id = ? AND deleted_at IS NULL', [userId]),
          selectSql<WeeklyTaskRow>('SELECT * FROM weekly_tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [userId]),
          selectSql<ProjectRow>('SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [userId]),
        ]);

        if (!mounted) return;
        setDailyTasks(dailyRows.filter((task) => parseArray(task.active_days).includes(logicalDay)));
        setWeeklyTasks(weeklyRows);
        setProjects(projectRows);
      } catch (e: any) {
        setError(e?.message || 'Unable to load tasks');
      } finally {
        if (mounted) {
          setLoading(false);
          setTimeout(() => {
            initialLoadRef.current = false;
          }, 0);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [logicalDay, userId]);

  const dailyCompleted = dailyTasks.filter((task) => Number(task.is_completed) === 1).length;
  const dailyProgress = dailyTasks.length === 0 ? 0 : (dailyCompleted / dailyTasks.length) * 100;

  const toggleDailyTask = async (task: DailyTaskRow) => {
    if (!userId) return;

    const newValue = Number(task.is_completed) === 1 ? 0 : 1;
    const now = new Date().toISOString();

    try {
      await executeSql('UPDATE daily_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [newValue, now, task.id]);
      await queueOfflineChange('daily_tasks', task.id, 'UPDATE', { ...task, is_completed: newValue, updated_at: now, active_days: parseArray(task.active_days) }, now);
      setDailyTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, is_completed: newValue, updated_at: now } : item)));

      if (!initialLoadRef.current && dailyCompleted + (newValue === 1 ? 1 : -1) >= dailyTasks.length && dailyTasks.length > 0) {
        try {
          const confetti = (await import('canvas-confetti')).default;
          confetti({ particleCount: 150, spread: 60 });
        } catch {
          // ignore missing confetti package in some environments
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Could not update daily task');
    }
  };

  const toggleWeeklyTask = async (task: WeeklyTaskRow) => {
    if (!userId) return;

    const newValue = Number(task.is_completed) === 1 ? 0 : 1;
    const now = new Date().toISOString();

    try {
      await executeSql('UPDATE weekly_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [newValue, now, task.id]);
      await queueOfflineChange('weekly_tasks', task.id, 'UPDATE', { ...task, is_completed: newValue, updated_at: now }, now);
      setWeeklyTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, is_completed: newValue, updated_at: now } : item)));
    } catch (e: any) {
      setError(e?.message || 'Could not update weekly task');
    }
  };

  const removeDailyTask = async (task: DailyTaskRow) => {
    try {
      await deleteDailyTask(task.id);
      const index = dailyTasks.findIndex((item) => item.id === task.id);
      setDailyTasks((current) => current.filter((item) => item.id !== task.id));
      showUndoToast('Task deleted', async () => {
        await restoreSoftDeletedTask('daily_tasks', task.id);
        setDailyTasks((current) => current.some((item) => item.id === task.id) ? current : [...current.slice(0, index), task, ...current.slice(index)]);
      });
    } catch (e: any) {
      setError(e?.message || 'Could not delete daily task');
    }
  };

  const removeWeeklyTask = async (task: WeeklyTaskRow) => {
    try {
      await deleteWeeklyTask(task.id);
      const index = weeklyTasks.findIndex((item) => item.id === task.id);
      setWeeklyTasks((current) => current.filter((item) => item.id !== task.id));
      showUndoToast('Task deleted', async () => {
        await restoreSoftDeletedTask('weekly_tasks', task.id);
        setWeeklyTasks((current) => current.some((item) => item.id === task.id) ? current : [...current.slice(0, index), task, ...current.slice(index)]);
      });
    } catch (e: any) {
      setError(e?.message || 'Could not delete weekly task');
    }
  };

  const createDailyTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userId || !dailyTitle.trim() || dailyDays.length === 0) return;

    const id = uid();
    const now = new Date().toISOString();
    const payload = {
      id,
      user_id: userId,
      title: dailyTitle.trim(),
      active_days: serializeArray(dailyDays),
      is_completed: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    try {
      await executeSql('INSERT INTO daily_tasks (id, user_id, title, active_days, is_completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, userId, payload.title, payload.active_days, payload.is_completed, payload.created_at, payload.updated_at, null]);
      await queueOfflineChange('daily_tasks', id, 'INSERT', { ...payload, active_days: JSON.parse(payload.active_days) }, now);

      if (dailyDays.includes(logicalDay)) {
        setDailyTasks((prev) => [...prev, payload as DailyTaskRow]);
      }
      setDailyTitle('');
      setDailyDays([]);
    } catch (e: any) {
      setError(e?.message || 'Could not create daily task');
    }
  };

  const createWeeklyTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userId || !weeklyTitle.trim()) return;

    const id = uid();
    const now = new Date().toISOString();
    const payload = {
      id,
      user_id: userId,
      title: weeklyTitle.trim(),
      is_completed: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    try {
      await executeSql('INSERT INTO weekly_tasks (id, user_id, title, is_completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [payload.id, payload.user_id, payload.title, 0, payload.created_at, payload.updated_at, null]);
      await queueOfflineChange('weekly_tasks', id, 'INSERT', { ...payload }, now);
      setWeeklyTasks((prev) => [payload, ...prev]);
      setWeeklyTitle('');
    } catch (e: any) {
      setError(e?.message || 'Could not create weekly task');
    }
  };

  const createProject = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userId || !projectTitle.trim()) return;

    const id = uid();
    const now = new Date().toISOString();
    const payload = {
      id,
      user_id: userId,
      title: projectTitle.trim(),
      is_finished: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    try {
      await executeSql('INSERT INTO projects (id, user_id, title, is_finished, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [payload.id, payload.user_id, payload.title, 0, payload.created_at, payload.updated_at, null]);
      await queueOfflineChange('projects', id, 'INSERT', { ...payload }, now);
      setProjects((prev) => [payload, ...prev]);
      setProjectTitle('');
    } catch (e: any) {
      setError(e?.message || 'Could not create project');
    }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-8 text-slate-300">Loading…</div>;
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
      <section className="card-blue p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-brand-muted">Daily Flow</div>
            <h2 className="mt-1 text-2xl font-semibold text-brand-text">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-300">{logicalDay}</span>
            <span className="inline-flex items-center rounded-full bg-blue-500/15 text-blue-200 px-2 py-1 text-xs font-medium">{Math.round(dailyProgress)}%</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-300">Completion</div>
            <div className="text-sm text-brand-text">{dailyCompleted} of {dailyTasks.length} done</div>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-700/80 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${dailyProgress}%` }} />
          </div>
        </div>

        <form className="mt-5 space-y-3" onSubmit={createDailyTask}>
          <div className="flex items-center gap-2">
            <input
              value={dailyTitle}
              onChange={(e) => setDailyTitle(e.target.value)}
              placeholder="New daily task"
              className="flex-1 bg-slate-900/80 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            />
            <button type="submit" className="btn-rounded">+ Add Daily Task</button>
          </div>

          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setDailyDays((prev) => prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day])}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${dailyDays.includes(day) ? 'bg-blue-500 text-white border-blue-500' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'}`}
              >
                {day}
              </button>
            ))}
          </div>
        </form>

        <div className="mt-5 space-y-2">
          {dailyTasks.length === 0 ? (
            <div className="text-sm text-slate-400">No tasks scheduled for {logicalDay}.</div>
          ) : (
            dailyTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/50 px-3 py-2 transition-opacity">
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={Number(task.is_completed) === 1}
                    onChange={() => void toggleDailyTask(task)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="text-sm text-slate-100 truncate">{task.title}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    {parseArray(task.active_days).map((day) => (
                      <span key={`${task.id}-${day}`} className="px-1.5 py-0.5 rounded bg-slate-700/80">{day}</span>
                    ))}
                  </div>
                  <button type="button" title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => void removeDailyTask(task)} className="btn-rounded-secondary shrink-0 p-1 text-slate-400 hover:text-red-400">Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card-blue p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-brand-text">Weekly Tasks</h3>
            <div className="mt-1 text-xs text-brand-muted">Resets Mon 2:00 AM</div>
          </div>
        </div>

        <form className="mt-4 flex items-center gap-2" onSubmit={createWeeklyTask}>
          <input
            value={weeklyTitle}
            onChange={(e) => setWeeklyTitle(e.target.value)}
            placeholder="New weekly task"
            className="flex-1 bg-slate-900/80 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button type="submit" className="btn-rounded">+ Add Weekly Task</button>
        </form>

        <div className="mt-4 space-y-2">
          {weeklyTasks.length === 0 ? (
            <div className="text-sm text-slate-400">No weekly tasks yet.</div>
          ) : (
            weeklyTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/50 px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <input
                    type="checkbox"
                    checked={Number(task.is_completed) === 1}
                    onChange={() => void toggleWeeklyTask(task)}
                    className="h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  <span className={`min-w-0 text-left text-sm ${Number(task.is_completed) === 1 ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                    {task.title}
                  </span>
                </label>
                <button type="button" title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => void removeWeeklyTask(task)} className="btn-rounded-secondary shrink-0 p-1 text-slate-400 hover:text-red-400">Delete</button>
              </div>
            ))
          )}
        </div>
      </section>

      {userId && <OtherTasksSection userId={userId} />}

      <section className="card-blue p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-brand-text">Projects</h3>
          <button type="button" className="btn-rounded">+ New Project</button>
        </div>

        <form className="mt-4 flex items-center gap-2" onSubmit={createProject}>
          <input
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="Project name"
            className="flex-1 bg-slate-900/80 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button type="submit" className="btn-rounded">Create</button>
        </form>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 ? (
            <div className="text-sm text-slate-400 col-span-full">No projects yet.</div>
          ) : (
            projects.map((project) => {
              const done = 0;
              const total = 0;
              const progress = total === 0 ? 0 : (done / total) * 100;

              return (
                <div key={project.id} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-base font-medium text-brand-text">{project.title}</div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{progress >= 100 ? 'Done' : 'Open'}</span>
                  </div>

                  <div className="mt-3 text-xs text-slate-300">{done}/{total} tasks</div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-700/80 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                  </div>

                  <button type="button" onClick={() => onOpenProject?.(project.id)} className="btn-rounded-secondary mt-4 w-full text-center justify-center">
                    Open Project →
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {error && <div className="text-red-300 text-sm">{error}</div>}
    </main>
  );
};

export default HomePage;
