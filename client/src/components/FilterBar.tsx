import type { DashboardView } from '../types/devices';

const DEVICE_TABS: Array<{ id: DashboardView; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'lights', label: 'Lights' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'locks', label: 'Locks' },
  { id: 'climate', label: 'Climate' },
  { id: 'other', label: 'Other' },
];

interface FilterBarProps {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  search: string;
  onSearchChange: (search: string) => void;
  counts: Partial<Record<DashboardView, number>>;
  /** The Rules tab only appears when Rule Machine is configured on the server. */
  showRules: boolean;
}

export function FilterBar({ view, onViewChange, search, onSearchChange, counts, showRules }: FilterBarProps) {
  const tabs: Array<{ id: DashboardView; label: string }> = [
    ...DEVICE_TABS,
    { id: 'automations', label: 'Automations' },
    ...(showRules ? [{ id: 'rules' as const, label: 'Rules' }] : []),
  ];

  const placeholder =
    view === 'automations' ? 'Search automations…' : view === 'rules' ? 'Search rules…' : 'Search devices…';

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div
        role="tablist"
        aria-label="Dashboard views"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:pb-0"
      >
        {tabs.map((tab) => {
          const selected = tab.id === view;
          const isView = tab.id === 'automations' || tab.id === 'rules';
          const count = counts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onViewChange(tab.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-all duration-300 ease-in-out ${
                tab.id === 'automations' ? 'md:ml-2' : ''
              } ${
                selected
                  ? 'border-accent/50 bg-accent/20 text-white'
                  : `bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200 ${
                      isView ? 'border-accent/20' : 'border-white/10'
                    }`
              }`}
            >
              {tab.label}
              {count !== undefined && (
                <span className={`font-mono text-xs tabular-nums ${selected ? 'text-accent-soft' : 'text-slate-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative md:w-72">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder.replace('…', '')}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 transition-all duration-300 ease-in-out focus:border-accent/50 focus:bg-white/[0.06]"
        />
      </div>
    </div>
  );
}
