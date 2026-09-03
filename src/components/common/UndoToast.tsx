import React, { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';

const UndoToast: React.FC = () => {
  const { toast, triggerUndo, dismissToast } = useToast();
  const [progressWidth, setProgressWidth] = useState('100%');

  useEffect(() => {
    if (!toast?.isVisible) {
      setProgressWidth('100%');
      return;
    }

    setProgressWidth('100%');
    const frame = window.requestAnimationFrame(() => setProgressWidth('0%'));
    return () => window.cancelAnimationFrame(frame);
  }, [toast?.id, toast?.isVisible]);

  if (!toast || !toast.isVisible) return null;

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50 flex min-w-[280px] items-center gap-4 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-800/95 px-4 py-3 text-slate-100 shadow-2xl backdrop-blur-md">
      <span className="min-w-0 flex-1 text-xs font-medium text-slate-200">{toast.message}</span>

      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={triggerUndo} className="btn-rounded py-1 px-3 text-xs bg-blue-500 hover:bg-blue-600 text-white">
          Undo
        </button>
        <button type="button" onClick={dismissToast} aria-label="Dismiss notification" title="Dismiss" className="p-1 text-slate-400 hover:text-slate-200">
          X
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 h-1 rounded-b-xl bg-blue-400/80 transition-all duration-[5000ms] ease-linear" style={{ width: progressWidth }} />
    </div>
  );
};

export default UndoToast;
