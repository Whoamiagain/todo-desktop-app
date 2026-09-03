import React, { useEffect, useState, useRef } from 'react';
import type { Project, ProjectTask } from '../../types';
import { restoreSoftDeletedTask, selectSql, executeSql } from '../../lib/localDb';
import { queueOfflineChange } from '../../lib/syncEngine';
import ProjectTaskItem from './ProjectTaskItem';
import { useToast } from '../../context/ToastContext';

function uid(): string {
  try {
    // @ts-ignore
    return (globalThis.crypto && (globalThis.crypto as any).randomUUID && (globalThis.crypto as any).randomUUID()) || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

const ProjectCard: React.FC<{ project: Project; userId: string }> = ({ project, userId }) => {
  const { showUndoToast } = useToast();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const initialLoadRef = useRef(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const rows = await selectSql<any>('SELECT * FROM project_tasks WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at ASC', [project.id]);
      if (!mounted) return;
      // normalize DB numeric flags to boolean for runtime
      const mapped = (rows || []).map((r: any) => ({
        ...r,
        is_completed: Boolean(Number(r.is_completed)),
      })) as ProjectTask[];
      setTasks(mapped);
      setTimeout(() => (initialLoadRef.current = false), 0);
    })();
    return () => {
      mounted = false;
    };
  }, [project.id]);

  const completedCount = tasks.filter((t) => Boolean(t.is_completed)).length;
  const total = tasks.length;

  const addTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;
    const id = uid();
    const now = new Date().toISOString();
    // runtime uses boolean is_completed; store numeric flag in DB
    const payload = { id, project_id: project.id, user_id: userId, title: newTaskTitle.trim(), is_completed: false, created_at: now, updated_at: now, deleted_at: null };
    await executeSql('INSERT INTO project_tasks (id, project_id, user_id, title, is_completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [payload.id, payload.project_id, payload.user_id, payload.title, payload.is_completed ? 1 : 0, payload.created_at, payload.updated_at, null]);
    await queueOfflineChange('project_tasks', id, 'INSERT', { ...payload }, now);
    setTasks((t) => [...t, payload as ProjectTask]);
    setNewTaskTitle('');
  };

  const toggleTask = async (task: ProjectTask) => {
    const newVal = !task.is_completed;
    const now = new Date().toISOString();
    await executeSql('UPDATE project_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [newVal ? 1 : 0, now, task.id]);
    await queueOfflineChange('project_tasks', task.id, 'UPDATE', { ...task, is_completed: newVal, updated_at: now }, now);
    setTasks((prev) => prev.map((p) => (p.id === task.id ? { ...p, is_completed: newVal, updated_at: now } : p)));

    // evaluate parent project completion
    const newCompleted = newVal ? completedCount + 1 : completedCount - 1;
    const newTotal = total;
    const finished = newTotal > 0 && newCompleted >= newTotal;
    await executeSql('UPDATE projects SET is_finished = ?, updated_at = ? WHERE id = ?', [finished ? 1 : 0, now, project.id]);
    await queueOfflineChange('projects', project.id, 'UPDATE', { ...project, is_finished: finished, updated_at: now }, now);

    if (!initialLoadRef.current && finished) {
      try {
        const confetti = (await import('canvas-confetti')).default;
        confetti({ particleCount: 150, spread: 60 });
      } catch {
        // ignore
      }
    }
  };

  const deleteTask = async (task: ProjectTask) => {
    const now = new Date().toISOString();
    const index = tasks.findIndex((item) => item.id === task.id);
    await executeSql('UPDATE project_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, task.id]);
    await queueOfflineChange('project_tasks', task.id, 'DELETE', { id: task.id, deleted_at: now }, now);
    setTasks((prev) => prev.filter((p) => p.id !== task.id));
    showUndoToast('Task deleted', async () => {
      await restoreSoftDeletedTask('project_tasks', task.id);
      setTasks((current) => current.some((item) => item.id === task.id) ? current : [...current.slice(0, index), task, ...current.slice(index)]);
    });

    // re-evaluate project finished
    const remaining = tasks.filter((t) => t.id !== task.id);
    const remCompleted = remaining.filter((t) => Boolean(t.is_completed)).length;
    const finished = remaining.length > 0 && remCompleted >= remaining.length;
    const now2 = new Date().toISOString();
    await executeSql('UPDATE projects SET is_finished = ?, updated_at = ? WHERE id = ?', [finished ? 1 : 0, now2, project.id]);
    await queueOfflineChange('projects', project.id, 'UPDATE', { ...project, is_finished: finished, updated_at: now2 }, now2);
  };

  return (
    <div className="border rounded p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-lg">{project.title}</div>
          <div className="text-sm text-gray-600">{completedCount}/{total} tasks completed</div>
        </div>
        <div>{project.is_finished ? <span className="text-green-600">Finished</span> : <span className="text-gray-500">In progress</span>}</div>
      </div>

      <div className="mt-3">
        <form onSubmit={addTask} className="flex gap-2">
          <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="New task" className="flex-1 bg-transparent border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none" />
          <button className="px-3 py-1 bg-blue-600 text-white rounded">Add</button>
        </form>

        <div className="mt-3 space-y-2">
          {tasks.map((t) => (
            <ProjectTaskItem key={t.id} title={t.title} is_completed={t.is_completed} onToggle={() => toggleTask(t)} onDelete={() => deleteTask(t)} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
