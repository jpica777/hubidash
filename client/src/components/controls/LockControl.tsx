import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface LockControlProps {
  name: string;
  state: string | null;
  onLock: () => Promise<unknown>;
  onUnlock: () => Promise<unknown>;
}

export function LockControl({ name, state, onLock, onUnlock }: LockControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirming) return undefined;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const locked = state === 'locked';
  const unlocked = state === 'unlocked';

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`btn ${locked ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200' : 'btn-ghost'}`}
          disabled={busy || locked}
          onClick={() => void run(onLock)}
        >
          Lock
        </button>
        <button
          type="button"
          className={`btn ${unlocked ? 'border border-rose-400/40 bg-rose-500/20 text-rose-200' : 'btn-ghost'}`}
          disabled={busy || unlocked}
          onClick={() => setConfirming(true)}
        >
          Unlock
        </button>
      </div>

      {confirming &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
          role="presentation"
          onClick={() => setConfirming(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unlock-title"
            className="glass w-full max-w-sm bg-base-raised/90 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="unlock-title" className="text-lg font-semibold text-white">
              Unlock door?
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Are you sure you want to unlock <span className="font-semibold text-white">{name}</span>?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button ref={cancelRef} type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  setConfirming(false);
                  void run(onUnlock);
                }}
              >
                Unlock
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
