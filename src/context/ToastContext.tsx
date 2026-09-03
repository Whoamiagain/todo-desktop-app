import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastState = {
  id: string;
  message: string;
  onUndo: () => void;
  isVisible: boolean;
} | null;

type ToastContextValue = {
  toast: ToastState;
  showUndoToast: (message: string, onUndo: () => void) => void;
  dismissToast: () => void;
  triggerUndo: () => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function createToastId(): string {
  const cryptoApi = globalThis.crypto as Crypto & { randomUUID?: () => string };
  return cryptoApi.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToastTimer = () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const dismissToast = () => {
    clearToastTimer();
    setToast((current) => current ? { ...current, isVisible: false } : null);
  };

  const showUndoToast = (message: string, onUndo: () => void) => {
    clearToastTimer();
    const id = createToastId();
    setToast({ id, message, onUndo, isVisible: true });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast((current) => current?.id === id ? null : current);
    }, 5000);
  };

  const triggerUndo = () => {
    clearToastTimer();
    const current = toast;
    setToast(null);
    if (current?.isVisible) void current.onUndo();
  };

  useEffect(() => {
    return () => clearToastTimer();
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showUndoToast, dismissToast, triggerUndo }}>
      {children}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
