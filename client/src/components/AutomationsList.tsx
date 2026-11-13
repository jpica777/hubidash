import { useMemo, useState } from 'react';
import type { Automation, AutomationLog as AutomationLogEntry, Device } from '../types/devices';
import {
  describeActions,
  describeCondition,
  describeTrigger,
  makeNameLookup,
} from '../utils/automationHelpers';
import { ToggleSwitch } from './controls/ToggleSwitch';
import { AutomationLog } from './AutomationLog';
import { ConfirmDialog } from './ConfirmDialog';

interface AutomationsListProps {
  automations: Automation[];
  logs: AutomationLogEntry[];
  devices: Device[];
  loaded: boolean;
  error: string | null;
  onCreate: () => void;
  onEdit: (automation: Automation) => void;
  onDelete: (automation: Automation) => Promise<void>;
  onToggle: (automation: Automation, enabled: boolean) => void;
  onTest: (automation: Automation) => Promise<void>;
}

const TRIGGER_ICON: Record<Automation['trigger']['type'], string> = {
  device_state: '⚡',
  schedule: '⟳',
  time_of_day: '◷',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AutomationsList({
  automations,
  logs,
  devices,
  loaded,
  error,
  onCreate,
  onEdit,
  onDelete,
  onToggle,
  onTest,
}: AutomationsListProps) {
  const nameOf = useMemo(() => makeNameLookup(devices), [devices]);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const logsById = useMemo(() => {
    const map = new Map<string, AutomationLogEntry[]>();
    for (const entry of logs) {
      const list = map.get(entry.automationId) ?? [];
      list.push(entry);
      map.set(entry.automationId, list);
    }
    return map;
  }, [logs]);

  const runTest = async (automation: Automation) => {
    setTesting(automation.id);
    try {
      await onTest(automation);
    } finally {
      setTesting(null);
    }
  };

  if (!loaded) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="glass h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {error && <div className="glass border-rose-500/30 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {automations.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-slate-300">No automations yet.</p>
          <p className="max-w-md text-sm text-slate-500">
            Create simple if/then rules that run on HubiDash, e.g. “when the basement leak sensor gets wet, turn on the kitchen
            light”.
          </p>
          <button type="button" className="btn-primary mt-2" onClick={onCreate}>
            + New automation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {automations.map((automation) => {
            const history = logsById.get(automation.id) ?? [];
            const last = history[0];
            return (
              <article
                key={automation.id}
                className={`glass flex flex-col gap-3 p-4 transition-all duration-300 ease-in-out hover:border-white/20 ${
                  automation.enabled ? '' : 'opacity-70'
                }`}
              >
                <header className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-white" title={automation.name}>
                      {automation.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          automation.enabled
                            ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                            : 'border-white/10 bg-white/[0.05] text-slate-400'
                        }`}
                      >
                        {automation.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {last ? `Last run ${relativeTime(last.triggeredAt)}` : 'Never run'}
                      </span>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={automation.enabled}
                    label={`${automation.enabled ? 'Disable' : 'Enable'} ${automation.name}`}
                    onChange={(next) => onToggle(automation, next)}
                  />
                </header>

                <dl className="space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-5 shrink-0 text-center text-accent-soft" aria-label="Trigger">
                      {TRIGGER_ICON[automation.trigger.type]}
                    </dt>
                    <dd className="text-slate-200">{describeTrigger(automation.trigger, nameOf)}</dd>
                  </div>
                  {automation.conditions && automation.conditions.length > 0 && (
                    <div className="flex gap-2">
                      <dt className="w-5 shrink-0 text-center text-slate-500" aria-label="Conditions">
                        ?
                      </dt>
                      <dd className="text-slate-400">
                        Only if {automation.conditions.map((c) => describeCondition(c, nameOf)).join(' and ')}
                      </dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="w-5 shrink-0 text-center text-slate-500" aria-label="Actions">
                      →
                    </dt>
                    <dd className="text-slate-300">{describeActions(automation.actions, nameOf)}</dd>
                  </div>
                </dl>

                <div className="border-t border-white/[0.06] pt-3">
                  <AutomationLog entries={history.slice(0, 3)} compact emptyText="No runs since the server started" />
                </div>

                <footer className="mt-auto flex gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={testing === automation.id}
                    onClick={() => void runTest(automation)}
                    title="Run the actions now, ignoring conditions"
                  >
                    {testing === automation.id ? 'Running…' : 'Test'}
                  </button>
                  <button type="button" className="btn-ghost text-xs" onClick={() => onEdit(automation)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost ml-auto text-xs text-rose-300 hover:text-rose-200"
                    onClick={() => setDeleting(automation)}
                  >
                    Delete
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {logs.length > 0 && (
        <section>
          <h2 className="section-label">Recent activity</h2>
          <AutomationLog entries={logs.slice(0, 10)} showName />
        </section>
      )}

      <button
        type="button"
        onClick={onCreate}
        aria-label="New automation"
        title="New automation"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-deep text-3xl font-light text-white shadow-[0_8px_30px_rgba(108,92,231,0.55)] transition-all duration-300 ease-in-out hover:scale-105 hover:bg-accent"
      >
        +
      </button>

      {deleting && (
        <ConfirmDialog
          title="Delete automation?"
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            void onDelete(target);
          }}
        >
          <span className="font-semibold text-white">{deleting.name}</span> will be permanently removed.
        </ConfirmDialog>
      )}
    </div>
  );
}
