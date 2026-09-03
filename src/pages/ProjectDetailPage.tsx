import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { initLocalDb, selectSql } from '../lib/localDb';
import ProjectCard from '../components/projects/ProjectCard';
import type { Project } from '../types';

type ProjectRow = Omit<Project, 'is_finished'> & { is_finished: number };

const ProjectDetailPage: React.FC<{ projectId: string | null }> = ({ projectId }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState(projectId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;

    (async () => {
      try {
        await initLocalDb();
        const rows = await selectSql<ProjectRow>('SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [user.id]);
        if (!mounted) return;
        const normalized = rows.map((project) => ({ ...project, is_finished: Boolean(Number(project.is_finished)) }));
        setProjects(normalized);
        setSelectedId((current) => current && normalized.some((project) => project.id === current) ? current : normalized[0]?.id ?? null);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load projects');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;

  if (loading) return <div className="text-slate-300">Loading projects...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-brand-muted">Project</p>
          <h1 className="mt-1 text-3xl font-semibold text-brand-text">Your projects</h1>
        </div>
        <span className="text-sm text-slate-400">{projects.length} project{projects.length === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="mb-4 text-sm text-red-300">{error}</div>}

      {projects.length === 0 ? (
        <div className="card-blue text-sm text-slate-400">No projects yet. Create one from Home.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedId(project.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${selectedId === project.id ? 'border-blue-500 bg-blue-500/10 text-blue-100' : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500'}`}
              >
                {project.title}
              </button>
            ))}
          </div>

          {selectedProject && user?.id && <ProjectCard project={selectedProject} userId={user.id} />}
        </div>
      )}
    </div>
  );
};

export default ProjectDetailPage;
