import React, { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type UpdateState = 'checking' | 'downloading' | 'ready' | 'latest' | 'unavailable';
type StatusHandler = (state: UpdateState, version?: string) => void;

let statusHandler: StatusHandler | null = null;
let updateCheckInProgress = false;

export async function checkForUpdates(manual = false): Promise<void> {
  if (updateCheckInProgress) return;

  updateCheckInProgress = true;
  if (manual) statusHandler?.('checking');

  try {
    const update = await check();
    if (!update?.available) {
      if (manual) {
        statusHandler?.('latest');
        window.setTimeout(() => statusHandler?.('latest'), 2500);
      }
      return;
    }

    statusHandler?.('downloading', update.version);
    await update.downloadAndInstall();
    statusHandler?.('ready', update.version);
  } catch {
    // Update checks are best-effort and must not interrupt app use while offline.
    if (manual) statusHandler?.('unavailable');
  } finally {
    updateCheckInProgress = false;
  }
}

const UpdateChecker: React.FC = () => {
  const [state, setState] = useState<UpdateState | null>(null);
  const [version, setVersion] = useState<string | undefined>();

  useEffect(() => {
    statusHandler = (nextState, nextVersion) => {
      setState(nextState);
      setVersion(nextVersion);
    };
    void checkForUpdates();

    return () => {
      if (statusHandler) statusHandler = null;
    };
  }, []);

  if (!state || state === 'checking' || state === 'latest' || state === 'unavailable') {
    return state === 'checking' || state === 'latest' || state === 'unavailable' ? (
      <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4" role="status" aria-live="polite">
        <div className="rounded-lg bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-slate-950/30">
          {state === 'checking'
            ? 'Checking for updates...'
            : state === 'latest'
              ? 'You are using the latest version.'
              : 'Unable to check for updates.'}
        </div>
      </div>
    ) : null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4" role="status" aria-live="polite">
      <div className="flex items-center gap-4 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-blue-950/30">
        <span>
          {state === 'downloading'
            ? `New version available (v${version}). Updating...`
            : `New version available (v${version}). Update ready.`}
        </span>
        {state === 'ready' && (
          <button
            type="button"
            className="rounded bg-white px-3 py-1 text-blue-700 transition hover:bg-blue-50"
            onClick={() => void relaunch()}
          >
            Restart App
          </button>
        )}
      </div>
    </div>
  );
};

export default UpdateChecker;