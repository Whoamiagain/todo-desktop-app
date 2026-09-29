import React, { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { unlinkCoupleLocally } from '../../lib/localDb';
import { queueOfflineChange } from '../../lib/syncEngine';
import { supabase } from '../../lib/supabase';

interface BreakUpModalProps {
  coupleId: string;
  isOpen: boolean;
  onClose: () => void;
  onUnlinked: () => void;
}

const CONFIRMATION_WORD = 'BREAKUP';

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: unknown; name?: unknown; status?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return candidate.name === 'FetchError' || candidate.status === 0 || message.includes('fetch') || message.includes('network') || message.includes('offline');
}

const BreakUpModal: React.FC<BreakUpModalProps> = ({ coupleId, isOpen, onClose, onUnlinked }) => {
  const { showUndoToast } = useToast();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const close = () => {
    if (isSubmitting) return;
    setConfirmation('');
    setError(null);
    onClose();
  };

  const unlink = async () => {
    if (confirmation !== CONFIRMATION_WORD || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const { error: deleteError } = await supabase.from('couples').delete().eq('id', coupleId);
      if (deleteError) {
        if (!isNetworkError(deleteError)) throw deleteError;
        await unlinkCoupleLocally(coupleId);
        await queueOfflineChange('couples', coupleId, 'DELETE', { id: coupleId }, new Date().toISOString());
      } else {
        await unlinkCoupleLocally(coupleId);
      }

      showUndoToast('Account unlinked. Past entries kept locally on this device.', async () => undefined);
      setConfirmation('');
      onUnlinked();
      onClose();
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : 'Unable to unlink account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div aria-labelledby="break-up-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-diary-border bg-diary-surface p-6 text-rose-950 shadow-2xl" role="dialog">
        <h2 id="break-up-title" className="text-xl font-bold">Unlink Partner &amp; Break Up?</h2>
        <p className="mt-3 text-sm leading-6 text-rose-900/75">This will permanently disconnect your accounts and stop future diary sync. Your past diary entries will remain saved locally on this device in Read-Only mode.</p>

        <label className="mt-5 block text-sm font-semibold" htmlFor="breakup-confirmation">Type BREAKUP to confirm</label>
        <input
          id="breakup-confirmation"
          autoFocus
          className="mt-2 w-full rounded-lg border border-diary-border bg-diary-bg px-3 py-2 font-mono uppercase text-rose-950 outline-none focus:border-diary-accent"
          disabled={isSubmitting}
          onChange={(event) => setConfirmation(event.target.value)}
          value={confirmation}
        />
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="rounded-full border border-diary-border px-4 py-2 text-sm text-rose-800 transition hover:bg-diary-bg" onClick={close} disabled={isSubmitting}>Cancel</button>
          <button type="button" className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40" disabled={confirmation !== CONFIRMATION_WORD || isSubmitting} onClick={() => void unlink()}>
            {isSubmitting ? 'Unlinking...' : 'Unlink & Break Up'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BreakUpModal;