import { useState } from 'react';
import type { RuleAction, RuleSummary } from '../types/devices';

interface RulesListProps {
  rules: RuleSummary[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  onRefresh: () => void;
  onAction: (rule: RuleSummary, action: RuleAction) => Promise<void>;
}

function RuleCard({ rule, onAction }: { rule: RuleSummary; onAction: RulesListProps['onAction'] }) {
  const [busy, setBusy] = useState<RuleAction | null>(null);

  const run = async (action: RuleAction) => {
    setBusy(action);
    try {
      await onAction(rule, action);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article
      className={`glass flex flex-col gap-4 p-4 transition-all duration-300 ease-in-out hover:border-white/20 ${
        rule.paused ? '' : 'border-emerald-400/20'
      }`}
    >
      <header className="flex items-start gap-3">
        <span
          className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-300 ${
            rule.paused ? 'bg-amber-400' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]'
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-white" title={rule.name}>
            {rule.name}
          </h3>
          <p className={`text-xs ${rule.paused ? 'text-amber-300' : 'text-emerald-300'}`}>
            {rule.paused ? 'Paused' : 'Active'} · <span className="font-mono text-slate-500">#{rule.id}</span>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="btn-ghost px-2"
          disabled={busy !== null}
          onClick={() => void run('run')}
          title="Run the rule's actions now"
        >
          {busy === 'run' ? '…' : '▶ Run'}
        </button>
        <button
          type="button"
          className="btn-ghost px-2"
          disabled={busy !== null || rule.paused}
          onClick={() => void run('pause')}
        >
          {busy === 'pause' ? '…' : '⏸ Pause'}
        </button>
        <button
          type="button"
          className="btn-ghost px-2"
          disabled={busy !== null || !rule.paused}
          onClick={() => void run('resume')}
        >
          {busy === 'resume' ? '…' : '▶ Resume'}
        </button>
      </div>
      <button
        type="button"
        className="-mt-2 self-start text-xs text-slate-500 transition-colors duration-300 hover:text-accent-soft disabled:opacity-50"
        disabled={busy !== null}
        onClick={() => void run('evaluate')}
        title="Evaluate the rule's conditions and run its actions only if they're true"
      >
        {busy === 'evaluate' ? 'Evaluating…' : 'Evaluate conditions & run'}
      </button>
    </article>
  );
}

export function RulesList({ rules, loading, loaded, error, onRefresh, onAction }: RulesListProps) {
  if (!loaded) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass h-36 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Rule Machine rules on your hub. Paused state comes from the hub's rule labels.
        </p>
        <button type="button" className="btn-ghost shrink-0 text-xs" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="glass border-rose-500/30 px-4 py-3 text-sm text-rose-200">Couldn't load rules: {error}</div>
      )}

      {rules.length === 0 && !error ? (
        <div className="glass px-6 py-16 text-center text-slate-300">No rules found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}
