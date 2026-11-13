import type { AutomationActionResult, AutomationLog as AutomationLogEntry } from '../types/devices';
import { formatTime } from '../utils/deviceHelpers';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? formatTime(iso) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ActionResults({ actions }: { actions: AutomationActionResult[] }) {
  return (
    <ul className="space-y-1">
      {actions.map((a, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span className={a.success ? 'text-emerald-400' : 'text-rose-400'} aria-label={a.success ? 'succeeded' : 'failed'}>
            {a.success ? '✓' : '✗'}
          </span>
          <span className="text-slate-300">
            {a.description}
            {a.error && <span className="text-rose-300"> — {a.error}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface AutomationLogProps {
  entries: AutomationLogEntry[];
  /** Compact rows for inline use on a card; full mode shows each action. */
  compact?: boolean;
  showName?: boolean;
  emptyText?: string;
}

export function AutomationLog({ entries, compact = false, showName = false, emptyText = 'No runs yet' }: AutomationLogProps) {
  if (entries.length === 0) return <p className="text-xs text-slate-500">{emptyText}</p>;

  return (
    <ul className={compact ? 'space-y-1' : 'space-y-3'}>
      {entries.map((entry) => {
        const ok = entry.actions.every((a) => a.success);
        return (
          <li key={entry.id} className={compact ? 'flex items-baseline gap-2 text-xs' : 'rounded-xl border border-white/[0.06] bg-white/[0.02] p-3'}>
            {compact ? (
              <>
                <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className="shrink-0 font-mono tabular-nums text-slate-500">{formatWhen(entry.triggeredAt)}</span>
                <span className="truncate text-slate-400" title={entry.triggerReason}>
                  {entry.triggerReason}
                </span>
              </>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  {showName && <span className="font-medium text-white">{entry.automationName}</span>}
                  <span className="text-slate-400">{entry.triggerReason}</span>
                  <span className="ml-auto font-mono text-xs tabular-nums text-slate-500">{formatWhen(entry.triggeredAt)}</span>
                </div>
                <ActionResults actions={entry.actions} />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
