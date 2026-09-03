import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { pushLocalChanges, pullRemoteChanges } from '../lib/syncEngine';

interface SyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const triggerSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      await pushLocalChanges();
      if (userId) await pullRemoteChanges(userId);
    } catch (err) {
      // swallow; will retry later
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      // auto-trigger sync when transitioning online
      void triggerSync();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // schedule periodic sync every 5 minutes when online
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      if (navigator.onLine) void triggerSync();
    }, 5 * 60 * 1000) as unknown as number;

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return <SyncContext.Provider value={{ isOnline, isSyncing, triggerSync }}>{children}</SyncContext.Provider>;
};

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
