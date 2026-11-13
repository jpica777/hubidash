import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  Automation,
  AutomationAction,
  AutomationCondition,
  AutomationDraft,
  AutomationLog,
  AutomationMeta,
  AutomationTrigger,
  Device,
} from '../types/devices';
import {
  ATTRIBUTE_VALUES,
  DAYS,
  automationToDraft,
  cleanDraft,
  commandTakesValue,
  deviceAttributes,
  emptyDraft,
  validateDraft,
} from '../utils/automationHelpers';
import { displayName } from '../utils/deviceHelpers';
import { apiRequest } from '../utils/api';
import { CronBuilder } from './controls/CronBuilder';
import { ActionResults } from './AutomationLog';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

interface AutomationEditorProps {
  automation: Automation | null;
  devices: Device[];
  meta: AutomationMeta | null;
  onClose: () => void;
  onSave: (draft: AutomationDraft, id?: string) => Promise<Result<Automation>>;
  onTestDraft: (draft: AutomationDraft) => Promise<Result<AutomationLog>>;
}

/* ------------------------------ small pickers ------------------------------ */

function DevicePicker({
  devices,
  value,
  onChange,
  label,
}: {
  devices: Device[];
  value: string | undefined;
  onChange: (id: string) => void;
  label: string;
}) {
  const known = !value || devices.some((d) => d.id === value);
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="field min-w-0 flex-1" aria-label={label}>
      <option value="">Choose a device…</option>
      {!known && <option value={value}>Device {value} (unavailable)</option>}
      {devices.map((d) => (
        <option key={d.id} value={d.id}>
          {displayName(d)}
        </option>
      ))}
    </select>
  );
}

function AttributePicker({
  device,
  value,
  onChange,
}: {
  device: Device | undefined;
  value: string | undefined;
  onChange: (attr: string) => void;
}) {
  const attrs = deviceAttributes(device);
  if (value && !attrs.includes(value)) attrs.unshift(value);
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={!device && !value}
      className="field min-w-0 flex-1"
      aria-label="Attribute"
    >
      <option value="">Attribute…</option>
      {attrs.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
}

function AttributeValueInput({
  device,
  attribute,
  value,
  onChange,
  numericOnly = false,
}: {
  device: Device | undefined;
  attribute: string | undefined;
  value: string;
  onChange: (v: string) => void;
  numericOnly?: boolean;
}) {
  const options = attribute && !numericOnly ? ATTRIBUTE_VALUES[attribute] : undefined;
  if (options) {
    const list = value && !options.includes(value) ? [value, ...options] : options;
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field min-w-0 flex-1" aria-label="Value">
        <option value="">Value…</option>
        {list.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  const current = attribute && device ? device.attributes[attribute] : undefined;
  return (
    <input
      type={numericOnly ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={current !== undefined && current !== null ? `now: ${String(current)}` : 'Value'}
      className="field min-w-0 flex-1"
      aria-label="Value"
    />
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-all duration-300 ease-in-out hover:bg-white/[0.07] hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* --------------------------------- editor --------------------------------- */

export function AutomationEditor({ automation, devices, meta, onClose, onSave, onTestDraft }: AutomationEditorProps) {
  const initial = useMemo(() => (automation ? automationToDraft(automation) : emptyDraft()), [automation]);
  const [draft, setDraft] = useState<AutomationDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AutomationLog | null>(null);
  const [showConditions, setShowConditions] = useState((initial.conditions?.length ?? 0) > 0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  /** Commands fetched per device; null while the request is in flight. */
  const [fetchedCommands, setFetchedCommands] = useState<Record<string, string[] | null>>({});

  const sortedDevices = useMemo(
    () => [...devices].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [devices],
  );
  const deviceById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const requestClose = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  // Lock page scroll while open and close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  // Fetch the command list from /api/devices/:id for action devices whose cached entry has none.
  const actionDeviceKey = [...new Set(draft.actions.map((a) => a.deviceId).filter((id): id is string => !!id))].join(',');
  useEffect(() => {
    if (!actionDeviceKey) return;
    for (const id of actionDeviceKey.split(',')) {
      const cached = deviceById.get(id);
      if ((cached && cached.commands.length > 0) || id in fetchedCommands) continue;
      setFetchedCommands((prev) => ({ ...prev, [id]: null }));
      void apiRequest<{ device: Device }>(`/api/devices/${encodeURIComponent(id)}`).then((res) => {
        setFetchedCommands((prev) => ({ ...prev, [id]: res.ok && res.data ? res.data.device.commands : [] }));
      });
    }
  }, [actionDeviceKey, deviceById, fetchedCommands]);

  const commandsFor = (deviceId: string | undefined): string[] | null => {
    if (!deviceId) return [];
    const cached = deviceById.get(deviceId)?.commands ?? [];
    if (cached.length) return [...cached].sort();
    const fetched = fetchedCommands[deviceId];
    return fetched === null || fetched === undefined ? null : [...fetched].sort();
  };

  /* ------------------------------ mutators ------------------------------ */

  const setTrigger = (patch: Partial<AutomationTrigger>) =>
    setDraft((d) => ({ ...d, trigger: { ...d.trigger, ...patch } }));

  const changeTriggerType = (type: AutomationTrigger['type']) => {
    if (type === draft.trigger.type) return;
    const trigger: AutomationTrigger =
      type === 'device_state'
        ? { type, deviceId: '', attribute: '', value: '' }
        : type === 'schedule'
          ? { type, cron: '0 23 * * *' }
          : { type, time: '23:00', days: DAYS.map((d) => d.id) };
    setDraft((d) => ({ ...d, trigger }));
  };

  const setCondition = (index: number, patch: Partial<AutomationCondition>) =>
    setDraft((d) => ({
      ...d,
      conditions: (d.conditions ?? []).map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));

  const addCondition = () => {
    setShowConditions(true);
    setDraft((d) => ({
      ...d,
      conditions: [...(d.conditions ?? []), { type: 'device', deviceId: '', attribute: '', operator: 'equals', value: '' }],
    }));
  };

  const removeCondition = (index: number) =>
    setDraft((d) => ({ ...d, conditions: (d.conditions ?? []).filter((_, i) => i !== index) }));

  const changeConditionType = (index: number, type: NonNullable<AutomationCondition['type']>) => {
    const next: AutomationCondition =
      type === 'device'
        ? { type, deviceId: '', attribute: '', operator: 'equals', value: '' }
        : type === 'time'
          ? { type, operator: 'after', value: '22:00' }
          : { type, operator: 'equals', value: 'dark' };
    setDraft((d) => ({ ...d, conditions: (d.conditions ?? []).map((c, i) => (i === index ? next : c)) }));
  };

  const setAction = (index: number, patch: Partial<AutomationAction>) =>
    setDraft((d) => ({ ...d, actions: d.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)) }));

  const addAction = (type: AutomationAction['type']) =>
    setDraft((d) => ({
      ...d,
      actions: [...d.actions, type === 'delay' ? { type, seconds: 5 } : { type, deviceId: '', command: '' }],
    }));

  const removeAction = (index: number) => setDraft((d) => ({ ...d, actions: d.actions.filter((_, i) => i !== index) }));

  const moveAction = (from: number, to: number) => {
    if (to < 0 || to >= draft.actions.length || from === to) return;
    setDraft((d) => {
      const actions = [...d.actions];
      const [item] = actions.splice(from, 1);
      actions.splice(to, 0, item);
      return { ...d, actions };
    });
  };

  /* ------------------------------ save / test ------------------------------ */

  const handleSave = async () => {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await onSave(cleanDraft(draft), automation?.id);
    setSaving(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  const handleTest = async () => {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setTesting(true);
    setError(null);
    setTestResult(null);
    const res = await onTestDraft(cleanDraft(draft));
    setTesting(false);
    if (res.ok) setTestResult(res.data);
    else setError(res.error);
  };

  /* --------------------------------- render -------------------------------- */

  const t = draft.trigger;
  const triggerDevice = deviceById.get(t.deviceId ?? '');
  const conditions = draft.conditions ?? [];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-start sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-editor-title"
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden bg-base shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:rounded-2xl sm:border sm:border-white/10"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <h2 id="automation-editor-title" className="text-lg font-semibold text-white">
            {automation ? 'Edit automation' : 'New automation'}
          </h2>
          <IconButton label="Close" onClick={requestClose}>
            ✕
          </IconButton>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Name */}
          <div>
            <label htmlFor="automation-name" className="section-label">
              Name
            </label>
            <input
              id="automation-name"
              type="text"
              value={draft.name}
              maxLength={100}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Leak alert light"
              className="field w-full"
            />
          </div>

          {/* Trigger */}
          <Section title="When…">
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  ['device_state', 'A device changes'],
                  ['schedule', 'On a schedule'],
                  ['time_of_day', 'At a specific time'],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => changeTriggerType(type)}
                  className={`rounded-xl border px-3 py-2 text-sm transition-all duration-300 ease-in-out ${
                    t.type === type
                      ? 'border-accent/50 bg-accent/20 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {t.type === 'device_state' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <DevicePicker
                  devices={sortedDevices}
                  value={t.deviceId}
                  label="Trigger device"
                  onChange={(id) => setTrigger({ deviceId: id, attribute: '', value: '' })}
                />
                <AttributePicker
                  device={triggerDevice}
                  value={t.attribute}
                  onChange={(attr) => setTrigger({ attribute: attr, value: '' })}
                />
                <span className="self-center text-xs text-slate-500">becomes</span>
                <AttributeValueInput
                  device={triggerDevice}
                  attribute={t.attribute}
                  value={t.value ?? ''}
                  onChange={(v) => setTrigger({ value: v })}
                />
              </div>
            )}

            {t.type === 'schedule' && (
              <CronBuilder value={t.cron ?? ''} onChange={(cron) => setTrigger({ cron })} timezone={meta?.timezone} />
            )}

            {t.type === 'time_of_day' && (
              <div className="space-y-3">
                <input
                  type="time"
                  value={t.time ?? ''}
                  onChange={(e) => setTrigger({ time: e.target.value })}
                  className="field w-40"
                  aria-label="Time"
                />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of week">
                  {DAYS.map((day) => {
                    const checked = t.days?.includes(day.id) ?? false;
                    return (
                      <label
                        key={day.id}
                        className={`cursor-pointer select-none rounded-lg border px-2.5 py-1.5 text-xs transition-all duration-300 ease-in-out ${
                          checked ? 'border-accent/50 bg-accent/20 text-white' : 'border-white/10 text-slate-400 hover:bg-white/[0.06]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() =>
                            setTrigger({
                              days: DAYS.map((d) => d.id).filter((id) =>
                                id === day.id ? !checked : (t.days ?? []).includes(id),
                              ),
                            })
                          }
                        />
                        {day.short}
                      </label>
                    );
                  })}
                </div>
                {meta && <p className="text-xs text-slate-500">Times are in {meta.timezone}</p>}
              </div>
            )}
          </Section>

          {/* Conditions */}
          <Section
            title="Only if…"
            aside={
              conditions.length === 0 ? (
                <button
                  type="button"
                  className="text-xs text-accent-soft hover:text-white"
                  onClick={() => (showConditions ? setShowConditions(false) : addCondition())}
                >
                  {showConditions ? 'Hide' : '+ Add condition'}
                </button>
              ) : (
                <span className="text-xs text-slate-500">All must be true</span>
              )
            }
          >
            {conditions.length === 0 && <p className="text-xs text-slate-500">Optional. Runs every time the trigger fires.</p>}
            <div className="space-y-2">
              {conditions.map((c, i) => {
                const type = c.type ?? 'device';
                const cDevice = deviceById.get(c.deviceId ?? '');
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] p-2 sm:flex-row sm:flex-wrap">
                    <select
                      value={type}
                      onChange={(e) => changeConditionType(i, e.target.value as NonNullable<AutomationCondition['type']>)}
                      className="field sm:w-32"
                      aria-label="Condition type"
                    >
                      <option value="device">Device</option>
                      <option value="time">Time</option>
                      <option value="sun" disabled={!meta?.sunConditionsAvailable && type !== 'sun'}>
                        Sun{meta?.sunConditionsAvailable ? '' : ' (set location)'}
                      </option>
                    </select>

                    {type === 'device' && (
                      <>
                        <DevicePicker
                          devices={sortedDevices}
                          value={c.deviceId}
                          label="Condition device"
                          onChange={(id) => setCondition(i, { deviceId: id, attribute: '', value: '' })}
                        />
                        <AttributePicker
                          device={cDevice}
                          value={c.attribute}
                          onChange={(attr) => setCondition(i, { attribute: attr, value: '' })}
                        />
                        <select
                          value={c.operator}
                          onChange={(e) => setCondition(i, { operator: e.target.value as AutomationCondition['operator'] })}
                          className="field sm:w-36"
                          aria-label="Comparison"
                        >
                          <option value="equals">is</option>
                          <option value="not_equals">is not</option>
                          <option value="greater_than">is above</option>
                          <option value="less_than">is below</option>
                        </select>
                        <AttributeValueInput
                          device={cDevice}
                          attribute={c.attribute}
                          value={c.value}
                          numericOnly={c.operator === 'greater_than' || c.operator === 'less_than'}
                          onChange={(v) => setCondition(i, { value: v })}
                        />
                      </>
                    )}

                    {type === 'time' && (
                      <>
                        <select
                          value={c.operator}
                          onChange={(e) => setCondition(i, { operator: e.target.value as 'after' | 'before' })}
                          className="field sm:w-36"
                          aria-label="Before or after"
                        >
                          <option value="after">is after</option>
                          <option value="before">is before</option>
                        </select>
                        <input
                          type="time"
                          value={c.value}
                          onChange={(e) => setCondition(i, { value: e.target.value })}
                          className="field sm:w-36"
                          aria-label="Time"
                        />
                        <p className="self-center text-xs text-slate-500">
                          {c.operator === 'after' ? 'until midnight' : 'from midnight'}
                        </p>
                      </>
                    )}

                    {type === 'sun' && (
                      <select
                        value={c.value}
                        onChange={(e) => setCondition(i, { value: e.target.value })}
                        className="field flex-1"
                        aria-label="Sun condition"
                      >
                        <option value="dark">It's dark (after sunset, before sunrise)</option>
                        <option value="light">It's light (after sunrise, before sunset)</option>
                      </select>
                    )}

                    <IconButton label="Remove condition" onClick={() => removeCondition(i)}>
                      ✕
                    </IconButton>
                  </div>
                );
              })}
            </div>
            {conditions.length > 0 && (
              <button type="button" className="mt-2 text-xs text-accent-soft hover:text-white" onClick={addCondition}>
                + Add condition
              </button>
            )}
            {showConditions && conditions.length === 0 && (
              <button type="button" className="btn-ghost mt-2 text-xs" onClick={addCondition}>
                + Add condition
              </button>
            )}
          </Section>

          {/* Actions */}
          <Section title="Then…" aside={<span className="text-xs text-slate-500">Runs in order</span>}>
            <ol className="space-y-2">
              {draft.actions.map((a, i) => {
                const commands = commandsFor(a.deviceId);
                const loadingCommands = commands === null;
                const available = commands ?? [];
                const commandList = a.command && !available.includes(a.command) ? [a.command, ...available] : available;
                return (
                  <li
                    key={i}
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (dragIndex !== null) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null) moveAction(dragIndex, i);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={`flex flex-col gap-2 rounded-xl border p-2 transition-all duration-300 ease-in-out sm:flex-row sm:items-center ${
                      dragIndex === i ? 'border-accent/50 opacity-50' : 'border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab select-none px-1 text-slate-600" aria-hidden="true" title="Drag to reorder">
                        ⋮⋮
                      </span>
                      <span className="w-5 font-mono text-xs text-slate-500">{i + 1}.</span>
                      <select
                        value={a.type}
                        onChange={(e) =>
                          setAction(
                            i,
                            e.target.value === 'delay'
                              ? { type: 'delay', seconds: 5, deviceId: undefined, command: undefined, value: undefined }
                              : { type: 'device_command', deviceId: '', command: '', seconds: undefined },
                          )
                        }
                        className="field flex-1 sm:w-40 sm:flex-none"
                        aria-label="Action type"
                      >
                        <option value="device_command">Control a device</option>
                        <option value="delay">Wait</option>
                      </select>
                    </div>

                    {a.type === 'device_command' ? (
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                        <DevicePicker
                          devices={sortedDevices}
                          value={a.deviceId}
                          label="Action device"
                          onChange={(id) => setAction(i, { deviceId: id, command: '', value: undefined })}
                        />
                        <select
                          value={a.command ?? ''}
                          onChange={(e) => setAction(i, { command: e.target.value, value: undefined })}
                          disabled={!a.deviceId}
                          className="field min-w-0 flex-1"
                          aria-label="Command"
                        >
                          <option value="">
                            {loadingCommands ? 'Loading commands…' : a.deviceId && commandList.length === 0 ? 'No commands' : 'Command…'}
                          </option>
                          {commandList.map((cmd) => (
                            <option key={cmd} value={cmd}>
                              {cmd}
                            </option>
                          ))}
                        </select>
                        {(commandTakesValue(a.command) || (a.value !== undefined && a.value !== '')) && (
                          <input
                            type="text"
                            value={a.value ?? ''}
                            onChange={(e) => setAction(i, { value: e.target.value })}
                            placeholder={a.command === 'setLevel' ? '0-100' : 'Value'}
                            className="field min-w-0 sm:w-24"
                            aria-label="Command value"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={3600}
                          value={a.seconds ?? ''}
                          onChange={(e) => setAction(i, { seconds: e.target.value === '' ? undefined : Number(e.target.value) })}
                          className="field w-28"
                          aria-label="Seconds to wait"
                        />
                        <span className="text-sm text-slate-400">seconds</span>
                      </div>
                    )}

                    <div className="flex gap-1 self-end sm:self-auto">
                      <IconButton label="Move up" onClick={() => moveAction(i, i - 1)} disabled={i === 0}>
                        ↑
                      </IconButton>
                      <IconButton label="Move down" onClick={() => moveAction(i, i + 1)} disabled={i === draft.actions.length - 1}>
                        ↓
                      </IconButton>
                      <IconButton label="Remove action" onClick={() => removeAction(i)} disabled={draft.actions.length === 1}>
                        ✕
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={() => addAction('device_command')}>
                + Control a device
              </button>
              <button type="button" className="btn-ghost text-xs" onClick={() => addAction('delay')}>
                + Wait
              </button>
            </div>
          </Section>

          {testResult && (
            <Section title="Test results" aside={<span className="text-xs text-slate-500">Conditions skipped</span>}>
              <ActionResults actions={testResult.actions} />
            </Section>
          )}
        </div>

        <footer className="border-t border-white/[0.06] px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                className="h-4 w-4 accent-violet-500"
              />
              Enabled
            </label>
            <button type="button" className="btn-ghost" onClick={() => void handleTest()} disabled={testing || saving}>
              {testing ? 'Running…' : 'Test'}
            </button>
            <button type="button" className="btn-ghost" onClick={requestClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving || testing}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
