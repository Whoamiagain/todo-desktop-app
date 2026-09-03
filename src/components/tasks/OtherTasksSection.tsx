import React, { useEffect, useState } from 'react';
import type { OtherTask } from '../../types';
import { createOtherTask, deleteOtherTask, getOtherTasks, restoreSoftDeletedTask, toggleOtherTask } from '../../lib/localDb';
import { useToast } from '../../context/ToastContext';

type OtherTasksSectionProps = {
  userId: string;
};

const OtherTasksSection: React.FC<OtherTasksSectionProps> = ({ userId }) => {
  const [tasks, setTasks] = useState<OtherTask[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showUndoToast } = useToast();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const loadedTasks = await getOtherTasks(userId);
        if (mounted) setTasks(loadedTasks.filter((task) => task.deleted_at === null));
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Could not load other tasks');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setError(null);
    try {
      const task = await createOtherTask(userId, title);
      setTasks((current) => [task, ...current]);
      setTitle('');
    } catch (e: any) {
      setError(e?.message || 'Could not create other task');
    }
  };

  const toggleTask = async (task: OtherTask) => {
    setError(null);
    const nextValue = !task.is_completed;

    try {
      await toggleOtherTask(task.id, nextValue);
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, is_completed: nextValue, updated_at: new Date().toISOString() } : item));
    } catch (e: any) {
      setError(e?.message || 'Could not update other task');
    }
  };

  const removeTask = async (task: OtherTask) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;

    setError(null);
    try {
      await deleteOtherTask(task.id);
      const index = tasks.findIndex((item) => item.id === task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      showUndoToast('Task deleted', async () => {
        await restoreSoftDeletedTask('other_tasks', task.id);
        setTasks((current) => current.some((item) => item.id === task.id) ? current : [...current.slice(0, index), task, ...current.slice(index)]);
      });
    } catch (e: any) {
      setError(e?.message || 'Could not delete other task');
    }
  };

  return (
    <section className="card-blue">
      <div>
        <h2 className="text-xl font-semibold text-brand-text">Other Tasks</h2>
        <p className="mt-1 text-sm text-brand-muted">One-time tasks not assigned to any project</p>
      </div>

      <form onSubmit={addTask} className="mt-4 flex items-center gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a one-time task"
          className="flex-1 bg-slate-900/80 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
        />
        <button type="submit" className="btn-rounded">+ Add Task</button>
      </form>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="text-sm text-slate-400">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No other tasks yet.</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/50 px-3 py-2">
              <label className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={task.is_completed}
                  onChange={() => void toggleTask(task)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                />
                <span className={`truncate text-sm ${task.is_completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                  {task.title}
                </span>
              </label>

              <button
                type="button"
                title="Delete task"
                aria-label={`Delete ${task.title}`}
                onClick={() => void removeTask(task)}
                className="shrink-0 rounded-full border border-red-500/40 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-500/10"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default OtherTasksSection;
