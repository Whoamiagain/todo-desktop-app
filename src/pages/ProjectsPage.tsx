import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { initLocalDb, selectSql, executeSql, restoreSoftDeletedTask } from '../lib/localDb';
import { queueOfflineChange } from '../lib/syncEngine';
import ProjectCard from '../components/projects/ProjectCard';
import type { Project } from '../types';
import { useToast } from '../context/ToastContext';

function uid(): string {
  try {
    // @ts-ignore
    return (globalThis.crypto && (globalThis.crypto as any).randomUUID && (globalThis.crypto as any).randomUUID()) || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const { showUndoToast } = useToast();
  const userId = user?.id;

  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initLocalDb();
        const rows = await selectSql<Project>('SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [userId]);
        if (!mounted) return;
        setProjects(rows);
      } catch (e: any) {
        setError(e?.message || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const createProject = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Title required');
    if (!userId) return setError('Not signed in');
    const id = uid();
    const now = new Date().toISOString();
    try {
      await executeSql('INSERT INTO projects (id, user_id, title, is_finished, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, userId, title.trim(), 0, now, now, null]);
      await queueOfflineChange('projects', id, 'INSERT', { id, user_id: userId as string, title: title.trim(), is_finished: false, created_at: now, updated_at: now, deleted_at: null }, now);
      setProjects((p) => [{ id, user_id: userId as string, title: title.trim(), is_finished: false, created_at: now, updated_at: now, deleted_at: null }, ...p]);
      setTitle('');
    } catch (e: any) {
      setError(e?.message || 'Failed to create project');
    }
  };

  const deleteProject = async (project: Project) => {
    const now = new Date().toISOString();
    const index = projects.findIndex((item) => item.id === project.id);
    try {
      await executeSql('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, project.id]);
      await queueOfflineChange('projects', project.id, 'DELETE', { ...project, deleted_at: now, updated_at: now }, now);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      showUndoToast('Project deleted', async () => {
        await restoreSoftDeletedTask('projects', project.id);
        setProjects((current) => current.some((item) => item.id === project.id) ? current : [...current.slice(0, index), project, ...current.slice(index)]);
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to delete project');
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <form className="mt-4 flex gap-2" onSubmit={createProject}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New project title" className="flex-1 px-3 py-2 border rounded" />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Create</button>
        </form>

        <div className="mt-6 space-y-4">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-600">{error}</div>}
          {projects.map((proj) => (
            <div key={proj.id}>
              <div className="mb-2 flex justify-end">
                <button type="button" className="btn-rounded-secondary p-1 text-slate-400 hover:text-red-400" onClick={() => void deleteProject(proj)}>Delete project</button>
              </div>
              <ProjectCard project={proj} userId={userId as string} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProjectsPage;
