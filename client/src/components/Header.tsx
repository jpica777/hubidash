import type { ConnectionStatus, HubitatMode } from '../types/devices';
import { formatTime } from '../utils/deviceHelpers';

interface HeaderProps {
  mode: HubitatMode | null;
  connection: ConnectionStatus;
  lastUpdated: string | null;
  stale: boolean;
  onLogout: () => void;
}

const CONNECTION_STYLES: Record<ConnectionStatus, { dot: string; label: string }> = {
  live: { dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]', label: 'Live' },
  connecting: { dot: 'bg-amber-400 animate-pulse', label: 'Connecting' },
  reconnecting: { dot: 'bg-amber-400 animate-pulse', label: 'Reconnecting' },
  disconnected: { dot: 'bg-rose-500', label: 'Disconnected' },
};

export function Header({ mode, connection, lastUpdated, stale, onLogout }: HeaderProps) {
  const conn = CONNECTION_STYLES[connection];

  return (
    <header className="border-b border-white/[0.06] bg-base/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-white">
            Hubi<span className="text-accent">Dash</span>
          </h1>
          {mode && (
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent-soft">
              {mode === 'cloud' ? '☁ Cloud' : '⌂ Local'}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400" title={`Connection: ${conn.label}`}>
            <span className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ease-in-out ${conn.dot}`} />
            <span className="hidden sm:inline">{conn.label}</span>
          </div>
          <div className="hidden text-xs text-slate-400 sm:block">
            Updated <span className="font-mono tabular-nums text-slate-300">{formatTime(lastUpdated)}</span>
          </div>
          {stale && (
            <span
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-200"
              title="The hub is unreachable. Showing the last known state."
            >
              Hub offline
            </span>
          )}
          <button type="button" onClick={onLogout} className="btn-ghost py-1.5 text-xs">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
