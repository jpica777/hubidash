import { WsConnectionStatus } from '../types/devices';

interface HeaderProps {
  wsStatus: WsConnectionStatus;
  lastUpdated: Date;
  stale: boolean;
  onLogout: () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const MODE = import.meta.env.VITE_HUBITAT_MODE as string | undefined;

export default function Header({ wsStatus, lastUpdated, stale, onLogout }: HeaderProps) {
  const dotColor =
    wsStatus === 'connected'
      ? 'bg-green-400'
      : wsStatus === 'reconnecting' || wsStatus === 'connecting'
      ? 'bg-yellow-400 animate-pulse'
      : 'bg-red-500';

  const statusLabel =
    wsStatus === 'connected'
      ? 'Live'
      : wsStatus === 'reconnecting'
      ? 'Reconnecting…'
      : wsStatus === 'connecting'
      ? 'Connecting…'
      : 'Disconnected';

  const modeLabel = MODE === 'cloud' ? '☁ Cloud' : '⌂ Local';

  return (
    <header className="bg-surface border-b border-border px-4 py-3">
      <div className="container mx-auto flex items-center justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-semibold text-white tracking-tight shrink-0">HubiDash</h1>

          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-muted shrink-0">
            {modeLabel}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-xs text-muted hidden sm:inline">{statusLabel}</span>
          </div>

          {stale && (
            <span className="text-xs text-yellow-400 shrink-0">⚠ Stale data</span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted hidden md:inline font-mono">
            {formatTime(lastUpdated)}
          </span>
          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm text-muted hover:text-white hover:border-accent transition-colors duration-200"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
