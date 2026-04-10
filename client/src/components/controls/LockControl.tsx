import { useState } from 'react';

interface LockControlProps {
  deviceName: string;
  locked: boolean;
  onLock: () => void;
  onUnlock: () => void;
  disabled?: boolean;
}

export default function LockControl({ deviceName, locked, onLock, onUnlock, disabled }: LockControlProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleUnlockRequest = () => {
    if (!disabled) setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    onUnlock();
  };

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => !disabled && onLock()}
          disabled={disabled || locked}
          className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
            locked
              ? 'bg-green-600/30 border border-green-500/50 text-green-400 cursor-default'
              : 'bg-surface-2 border border-border text-muted hover:border-green-500/50 hover:text-green-400'
          } disabled:opacity-50`}
        >
          🔒 Lock
        </button>
        <button
          type="button"
          onClick={handleUnlockRequest}
          disabled={disabled || !locked}
          className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
            !locked
              ? 'bg-red-600/30 border border-red-500/50 text-red-400 cursor-default'
              : 'bg-surface-2 border border-border text-muted hover:border-red-500/50 hover:text-red-400'
          } disabled:opacity-50`}
        >
          🔓 Unlock
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="glass rounded-2xl p-6 w-full max-w-sm border border-red-500/30">
            <h3 className="text-base font-semibold text-white mb-2">Confirm Unlock</h3>
            <p className="text-sm text-muted mb-6">
              Are you sure you want to unlock <span className="text-white font-medium">{deviceName}</span>?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2 rounded-lg bg-surface-2 border border-border text-sm text-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
