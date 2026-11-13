import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Automation,
  CategoryFilter,
  DashboardView,
  Device,
  DeviceCategory,
  HubitatMode,
  RuleAction,
  RuleSummary,
  ServerMessage,
} from '../types/devices';
import { detectKind, displayName, getAlerts, getCategory } from '../utils/deviceHelpers';
import { useDevices } from '../hooks/useDevices';
import { useAutomations } from '../hooks/useAutomations';
import { useRules } from '../hooks/useRules';
import { Header } from './Header';
import { AlertBanner } from './AlertBanner';
import { FilterBar } from './FilterBar';
import { DeviceGrid } from './DeviceGrid';
import { AutomationsList } from './AutomationsList';
import { AutomationEditor } from './AutomationEditor';
import { RulesList } from './RulesList';
import { Toasts, useToasts } from './Toasts';

interface DashboardProps {
  wsToken: string;
  mode: HubitatMode | null;
  onLogout: () => void;
  onSessionExpired: () => void;
}

const VIEW_KEY = 'hubidash.category';
const VIEWS: DashboardView[] = ['all', 'lights', 'sensors', 'locks', 'climate', 'other', 'automations', 'rules'];

const RULE_ACTION_TEXT: Record<RuleAction, string> = {
  run: 'Ran',
  evaluate: 'Evaluated',
  pause: 'Paused',
  resume: 'Resumed',
};

function readStoredView(): DashboardView {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored && (VIEWS as string[]).includes(stored)) return stored as DashboardView;
  } catch {
    // storage unavailable (private mode etc.)
  }
  return 'all';
}

/** null = closed, 'new' = creating, otherwise the automation being edited. */
type EditorState = null | 'new' | Automation;

export function Dashboard({ wsToken, mode, onLogout, onSessionExpired }: DashboardProps) {
  const { toasts, notify, dismiss } = useToasts();
  const automations = useAutomations(onSessionExpired);
  const rules = useRules(onSessionExpired);
  const { addLog } = automations;

  const handleServerEvent = useCallback(
    (msg: ServerMessage) => {
      if (msg.type !== 'automation') return;
      addLog(msg.log);
      const failed = msg.log.actions.filter((a) => !a.success).length;
      if (failed > 0) notify('error', `Automation "${msg.log.automationName}" ran with ${failed} failed action(s)`);
      else notify('success', `Automation "${msg.log.automationName}" triggered`);
    },
    [addLog, notify],
  );

  const { devices, loaded, loadError, stale, lastUpdated, connection, sendCommand, commandError, dismissCommandError } =
    useDevices({ wsToken, onUnauthorized: onSessionExpired, onServerEvent: handleServerEvent });

  const [view, setView] = useState<DashboardView>(readStoredView);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);

  // Fall back to "All" if Rules was remembered but Rule Machine isn't configured anymore.
  const effectiveView: DashboardView = view === 'rules' && rules.configured === false ? 'all' : view;

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      // ignore
    }
  }, [view]);

  // Route device command failures into the toast stack.
  useEffect(() => {
    if (!commandError) return;
    notify('error', commandError);
    dismissCommandError();
  }, [commandError, dismissCommandError, notify]);

  // Load rules lazily the first time the Rules view opens.
  const { configured: rulesConfigured, loaded: rulesLoaded, refresh: refreshRules } = rules;
  useEffect(() => {
    if (effectiveView === 'rules' && rulesConfigured && !rulesLoaded) void refreshRules();
  }, [effectiveView, rulesConfigured, rulesLoaded, refreshRules]);

  const categorized = useMemo(
    () => devices.map((device) => ({ device, category: getCategory(detectKind(device)) })),
    [devices],
  );

  const query = search.trim().toLowerCase();

  const counts = useMemo(() => {
    const result: Partial<Record<DashboardView, number>> = {
      all: 0,
      lights: 0,
      sensors: 0,
      locks: 0,
      climate: 0,
      other: 0,
      automations: automations.automations.length,
    };
    if (rules.loaded) result.rules = rules.rules.length;
    for (const { category: c } of categorized) {
      result.all = (result.all ?? 0) + 1;
      result[c] = (result[c] ?? 0) + 1;
    }
    return result;
  }, [categorized, automations.automations.length, rules.loaded, rules.rules.length]);

  const visibleDevices = useMemo(() => {
    const category = effectiveView as CategoryFilter;
    return categorized
      .filter(({ category: c }) => category === 'all' || c === (category as DeviceCategory))
      .filter(({ device }) => !query || displayName(device).toLowerCase().includes(query))
      .map(({ device }) => device);
  }, [categorized, effectiveView, query]);

  const visibleAutomations = useMemo(
    () => automations.automations.filter((a) => !query || a.name.toLowerCase().includes(query)),
    [automations.automations, query],
  );

  const visibleRules = useMemo(
    () => rules.rules.filter((r) => !query || r.name.toLowerCase().includes(query)),
    [rules.rules, query],
  );

  const bannerAlerts = useMemo(() => devices.flatMap((d: Device) => getAlerts(d).filter((a) => a.banner)), [devices]);

  /* --------------------------- automation handlers --------------------------- */

  const handleToggle = async (automation: Automation, enabled: boolean) => {
    const res = await automations.toggle(automation.id, enabled);
    if (!res.ok) notify('error', res.error);
  };

  const handleDelete = async (automation: Automation) => {
    const res = await automations.remove(automation.id);
    notify(res.ok ? 'success' : 'error', res.ok ? `Deleted "${automation.name}"` : res.error);
  };

  const handleTest = async (automation: Automation) => {
    const res = await automations.test(automation.id);
    if (!res.ok) notify('error', res.error);
    // Success toasts arrive via the WebSocket "automation" event.
  };

  const handleRuleAction = async (rule: RuleSummary, action: RuleAction) => {
    const res = await rules.act(rule.id, action);
    notify(
      res.ok ? 'success' : 'error',
      res.ok ? `${RULE_ACTION_TEXT[action]} "${rule.name}"` : `${rule.name}: ${res.error ?? 'failed'}`,
    );
  };

  /* --------------------------------- render ---------------------------------- */

  let emptyMessage = 'No devices in this category.';
  if (query) emptyMessage = `No devices match "${search.trim()}".`;
  else if (devices.length === 0 && stale) emptyMessage = 'Hub unreachable — waiting for it to come back online…';
  else if (devices.length === 0) emptyMessage = 'No devices found. Check which devices are enabled in the Maker API app.';

  const isDeviceView = effectiveView !== 'automations' && effectiveView !== 'rules';

  return (
    <div className="min-h-screen">
      <AlertBanner alerts={bannerAlerts} />
      <Header mode={mode} connection={connection} lastUpdated={lastUpdated} stale={stale} onLogout={onLogout} />

      <main className="mx-auto max-w-screen-2xl space-y-5 px-4 py-5 sm:px-6">
        <FilterBar
          view={effectiveView}
          onViewChange={setView}
          search={search}
          onSearchChange={setSearch}
          counts={counts}
          showRules={rules.configured === true}
        />

        {isDeviceView && !loaded && !loadError && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="glass h-40 animate-pulse" />
            ))}
          </div>
        )}

        {isDeviceView && !loaded && loadError && (
          <div className="glass border-rose-500/30 px-6 py-10 text-center">
            <p className="font-medium text-rose-200">{loadError}</p>
            <p className="mt-1 text-sm text-slate-400">Retrying automatically while the live connection reconnects.</p>
          </div>
        )}

        {isDeviceView && loaded && (
          <DeviceGrid devices={visibleDevices} onCommand={sendCommand} emptyMessage={emptyMessage} />
        )}

        {effectiveView === 'automations' && (
          <AutomationsList
            automations={visibleAutomations}
            logs={automations.logs}
            devices={devices}
            loaded={automations.loaded}
            error={automations.error}
            onCreate={() => setEditor('new')}
            onEdit={(a) => setEditor(a)}
            onDelete={handleDelete}
            onToggle={(a, enabled) => void handleToggle(a, enabled)}
            onTest={handleTest}
          />
        )}

        {effectiveView === 'rules' && (
          <RulesList
            rules={visibleRules}
            loading={rules.loading}
            loaded={rules.loaded}
            error={rules.error}
            onRefresh={() => void rules.refresh()}
            onAction={handleRuleAction}
          />
        )}
      </main>

      {editor !== null && (
        <AutomationEditor
          automation={editor === 'new' ? null : editor}
          devices={devices}
          meta={automations.meta}
          onClose={() => setEditor(null)}
          onSave={async (draft, id) => {
            const res = await automations.save(draft, id);
            if (res.ok) notify('success', `Saved "${res.data.name}"`);
            return res;
          }}
          onTestDraft={automations.testDraft}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
