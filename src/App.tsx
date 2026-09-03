import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider, useSync } from './context/SyncContext';
import { initLocalDb } from './lib/localDb';
import Sidebar from './components/layout/Sidebar';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import HistoryPage from './pages/HistoryPage';
import PrivacyPolicy from './pages/Legal/PrivacyPolicy';
import TermsOfService from './pages/Legal/TermsOfService';
import { ToastProvider } from './context/ToastContext';
import UndoToast from './components/common/UndoToast';
import UpdateChecker, { checkForUpdates } from './components/common/UpdateChecker';

type ActiveView = 'home' | 'project-detail' | 'history';

const AppHeader: React.FC<{
  onHome: () => void;
  onProject: () => void;
  onHistory: () => void;
  isOnline: boolean;
  isSyncing: boolean;
  email?: string | null;
  onSync: () => void;
  onCheckForUpdates: () => void;
  onSignOut: () => void;
}> = ({ onHome, onProject, onHistory, isOnline, isSyncing, email, onSync, onCheckForUpdates, onSignOut }) => {
  return (
    <header className="border-b border-slate-800 bg-brand-surface/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onHome} className="text-lg font-semibold text-brand-text">Todo</button>
          <nav className="flex items-center gap-2 text-sm text-slate-300">
            <button type="button" onClick={onHome} className="rounded-full px-3 py-1.5 transition hover:bg-slate-800">Home</button>
            <button type="button" onClick={onProject} className="rounded-full px-3 py-1.5 transition hover:bg-slate-800">Project</button>
            <button type="button" onClick={onHistory} className="rounded-full px-3 py-1.5 transition hover:bg-slate-800">History</button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`} />
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          <button type="button" className="btn-rounded-secondary" onClick={onSync} disabled={!isOnline || isSyncing}>
            {isSyncing ? 'Syncing...' : 'Sync now'}
          </button>

          <button type="button" className="btn-rounded-secondary" onClick={onCheckForUpdates}>
            Check for Updates
          </button>

          <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-sm text-slate-200">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-200">
              {email?.slice(0, 1).toUpperCase() || 'U'}
            </span>
            <span className="max-w-[180px] truncate">{email || 'User'}</span>
          </div>

          <button type="button" className="btn-rounded" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </header>
  );
};

const AppShell: React.FC = () => {
  const { user, signOut } = useAuth();
  const { isOnline, isSyncing, triggerSync } = useSync();
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTOS, setShowTOS] = useState(false);

  useEffect(() => {
    if (user) void triggerSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const isHome = activeView === 'home';

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <AppHeader
        onHome={() => setActiveView('home')}
        onProject={() => {
          setSelectedProjectId(null);
          setActiveView('project-detail');
        }}
        onHistory={() => setActiveView('history')}
        isOnline={isOnline}
        isSyncing={isSyncing}
        email={user?.email}
        onSync={() => void triggerSync()}
        onCheckForUpdates={() => void checkForUpdates(true)}
        onSignOut={() => void signOut()}
      />

      {isHome ? (
        <main className="w-full">
          <HomePage onOpenProject={(projectId) => {
            setSelectedProjectId(projectId);
            setActiveView('project-detail');
          }} />
        </main>
      ) : (
        <div className="flex h-screen overflow-hidden">
          <Sidebar onHome={() => setActiveView('home')} />

          <main className="flex-1 h-screen overflow-y-auto bg-brand-bg p-8">
            {activeView === 'project-detail' ? <ProjectDetailPage projectId={selectedProjectId} /> : <HistoryPage />}
          </main>
        </div>
      )}

      <footer className="border-t border-slate-800 bg-brand-surface/60 px-6 py-4 text-sm text-slate-300">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} Todo App</span>
          <span>
            <button className="text-blue-400 underline mr-2" onClick={() => setShowPrivacy(true)}>Privacy Policy</button>
            <button className="text-blue-400 underline" onClick={() => setShowTOS(true)}>Terms</button>
          </span>
        </div>
      </footer>

      {showPrivacy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl p-6 overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold text-slate-900">Privacy Policy</h3>
              <button className="text-slate-600" onClick={() => setShowPrivacy(false)}>Close</button>
            </div>
            <div className="mt-4"><PrivacyPolicy /></div>
          </div>
        </div>
      )}

      {showTOS && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl p-6 overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold text-slate-900">Terms of Service</h3>
              <button className="text-slate-600" onClick={() => setShowTOS(false)}>Close</button>
            </div>
            <div className="mt-4"><TermsOfService /></div>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const getInitializationError = (error: unknown): string => {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const candidate = error as { message?: unknown; error?: unknown; cause?: unknown };
      if (typeof candidate.message === 'string') return candidate.message;
      if (typeof candidate.error === 'string') return candidate.error;
      if (candidate.cause) return getInitializationError(candidate.cause);
      try {
        return JSON.stringify(error);
      } catch {
        return 'Unable to initialize the local database.';
      }
    }
    return 'Unable to initialize the local database.';
  };

  const initializeDatabase = async () => {
    setDbError(null);
    try {
      await initLocalDb();
      setIsDbReady(true);
    } catch (error: unknown) {
      setDbError(getInitializationError(error));
    }
  };

  useEffect(() => {
    void initializeDatabase();
  }, []);

  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 text-slate-100">
        <div className="text-center">
          <p className="text-sm">{dbError ? 'Local database initialization failed.' : 'Initializing local database...'}</p>
          {dbError && <p className="mt-2 max-w-md text-xs text-red-300">{dbError}</p>}
          {dbError && (
            <button type="button" className="btn-rounded mt-4" onClick={() => void initializeDatabase()}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <AuthProvider>
        <SyncProvider>
          <AppContent />
          <UpdateChecker />
          <UndoToast />
        </SyncProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <AuthPage />;
  return <AppShell />;
};

export default App;
