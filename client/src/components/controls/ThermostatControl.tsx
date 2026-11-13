import { useEffect, useRef, useState } from 'react';
import type { CommandFn, Device } from '../../types/devices';
import { attrString, capitalize, hasCommand, parseModeList, toNumber } from '../../utils/deviceHelpers';

const DEFAULT_MODES = ['off', 'heat', 'cool', 'auto'];
const SETPOINT_DELAY_MS = 700;

interface SetpointStepperProps {
  label: string;
  value: number | null;
  tone: 'heat' | 'cool';
  onCommit: (value: number) => Promise<unknown>;
}

function SetpointStepper({ label, value, tone, onCommit }: SetpointStepperProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const current = draft ?? value;

  const step = (delta: number) => {
    if (current === null) return;
    const next = Math.round((current + delta) * 2) / 2;
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void onCommit(next).finally(() => setDraft((d) => (d === next ? null : d)));
    }, SETPOINT_DELAY_MS);
  };

  const accent = tone === 'heat' ? 'text-orange-300' : 'text-sky-300';

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className={`text-xs font-medium uppercase tracking-wide ${accent}`}>{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost h-8 w-8 p-0 text-lg"
          aria-label={`Decrease ${label} setpoint`}
          disabled={current === null}
          onClick={() => step(-1)}
        >
          −
        </button>
        <span className="w-12 text-center font-mono text-base tabular-nums text-white">
          {current === null ? '—' : `${current}°`}
        </span>
        <button
          type="button"
          className="btn-ghost h-8 w-8 p-0 text-lg"
          aria-label={`Increase ${label} setpoint`}
          disabled={current === null}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface ThermostatControlProps {
  device: Device;
  onCommand: CommandFn;
}

export function ThermostatControl({ device, onCommand }: ThermostatControlProps) {
  const a = device.attributes;
  const mode = attrString(device, 'thermostatMode') ?? 'off';
  const modes = parseModeList(a.supportedThermostatModes, DEFAULT_MODES);
  const modeOptions = modes.includes(mode) ? modes : [mode, ...modes];
  const operating = attrString(device, 'thermostatOperatingState');
  const heat = toNumber(a.heatingSetpoint) ?? toNumber(a.thermostatSetpoint);
  const cool = toNumber(a.coolingSetpoint) ?? toNumber(a.thermostatSetpoint);

  const showHeat = ['heat', 'emergency heat', 'auto'].includes(mode) && hasCommand(device, 'setHeatingSetpoint');
  const showCool = ['cool', 'auto'].includes(mode) && hasCommand(device, 'setCoolingSetpoint');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`mode-${device.id}`}>
          Thermostat mode
        </label>
        <select
          id={`mode-${device.id}`}
          value={mode}
          disabled={!hasCommand(device, 'setThermostatMode')}
          onChange={(e) =>
            void onCommand(device.id, 'setThermostatMode', e.target.value, { thermostatMode: e.target.value })
          }
          className="flex-1 rounded-xl border border-white/10 bg-base-raised px-3 py-2 text-sm text-slate-100 transition-all duration-300 ease-in-out hover:border-white/20 disabled:opacity-50"
        >
          {modeOptions.map((m) => (
            <option key={m} value={m}>
              {capitalize(m)}
            </option>
          ))}
        </select>
        {operating && (
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">
            {capitalize(operating)}
          </span>
        )}
      </div>
      {showHeat && (
        <SetpointStepper
          label="Heat to"
          value={heat}
          tone="heat"
          onCommit={(v) => onCommand(device.id, 'setHeatingSetpoint', v, { heatingSetpoint: v })}
        />
      )}
      {showCool && (
        <SetpointStepper
          label="Cool to"
          value={cool}
          tone="cool"
          onCommit={(v) => onCommand(device.id, 'setCoolingSetpoint', v, { coolingSetpoint: v })}
        />
      )}
      {!showHeat && !showCool && mode === 'off' && <p className="text-xs text-slate-500">System is off</p>}
    </div>
  );
}
