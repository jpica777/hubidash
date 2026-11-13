import { memo, useEffect, useRef, useState } from 'react';
import type { CommandFn, Device, StatusTone } from '../types/devices';
import {
  LOW_BATTERY_THRESHOLD,
  attrString,
  detectKind,
  deviceColorHex,
  displayName,
  getAlerts,
  getBattery,
  getPrimaryState,
  getReadings,
  getStatusTone,
  hasCommand,
  stateSignature,
  toNumber,
} from '../utils/deviceHelpers';
import { DeviceIcon } from './DeviceIcon';
import { ToggleSwitch } from './controls/ToggleSwitch';
import { DimmerSlider } from './controls/DimmerSlider';
import { LockControl } from './controls/LockControl';
import { ColorPicker } from './controls/ColorPicker';
import { ThermostatControl } from './controls/ThermostatControl';

interface DeviceCardProps {
  device: Device;
  onCommand: CommandFn;
}

const TONE_STYLES: Record<StatusTone, { card: string; icon: string; state: string }> = {
  active: {
    card: 'border-emerald-400/25 shadow-[0_0_24px_-8px_rgba(16,185,129,0.45)]',
    icon: 'bg-emerald-500/15 text-emerald-300',
    state: 'text-emerald-300',
  },
  alert: {
    card: 'border-rose-500/40 bg-rose-500/[0.06] shadow-[0_0_28px_-8px_rgba(244,63,94,0.55)]',
    icon: 'bg-rose-500/15 text-rose-300',
    state: 'text-rose-300',
  },
  neutral: {
    card: '',
    icon: 'bg-white/[0.06] text-slate-400',
    state: 'text-slate-200',
  },
};

function BatteryBadge({ level }: { level: number }) {
  const low = level < LOW_BATTERY_THRESHOLD;
  const fillWidth = Math.max(1, Math.round((level / 100) * 14));
  return (
    <span
      className={`flex items-center gap-1 font-mono text-xs tabular-nums ${low ? 'text-rose-300' : 'text-slate-400'}`}
      title={`Battery ${level}%`}
    >
      <svg viewBox="0 0 24 12" className="h-3 w-6" aria-hidden="true">
        <rect x="0.75" y="0.75" width="19.5" height="10.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="21.5" y="3.5" width="2" height="5" rx="1" fill="currentColor" />
        <rect x="3" y="3" width={fillWidth} height="6" rx="1" fill="currentColor" />
      </svg>
      {level}%
    </span>
  );
}

function DeviceCardInner({ device, onCommand }: DeviceCardProps) {
  const kind = detectKind(device);
  const name = displayName(device);
  const tone = getStatusTone(device);
  const styles = TONE_STYLES[tone];
  const primary = getPrimaryState(device, kind);
  const readings = getReadings(device, primary.attr);
  const battery = getBattery(device);
  const alerts = getAlerts(device);

  // Glow briefly whenever the device's state changes.
  const signature = stateSignature(device);
  const previous = useRef(signature);
  const [glowing, setGlowing] = useState(false);
  useEffect(() => {
    if (previous.current === signature) return undefined;
    previous.current = signature;
    // Remove then re-add the class so back-to-back changes restart the animation.
    setGlowing(false);
    const frame = window.requestAnimationFrame(() => setGlowing(true));
    return () => window.cancelAnimationFrame(frame);
  }, [signature]);

  const switchState = attrString(device, 'switch');
  const isOn = switchState === 'on';
  const level = toNumber(device.attributes.level) ?? 0;

  const canToggle =
    kind !== 'lock' && kind !== 'thermostat' && switchState !== null && hasCommand(device, 'on') && hasCommand(device, 'off');
  const canDim = canToggle && hasCommand(device, 'setLevel') && 'level' in device.attributes;
  const canColor = canToggle && hasCommand(device, 'setColor');
  const isLock = kind === 'lock' && hasCommand(device, 'lock') && hasCommand(device, 'unlock');
  const isThermostat = kind === 'thermostat';

  const subtitle = [device.room, device.type].filter(Boolean).join(' · ');

  return (
    <article
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setGlowing(false);
      }}
      className={`glass flex flex-col gap-4 p-4 transition-all duration-300 ease-in-out hover:border-white/20 ${styles.card} ${
        glowing ? 'animate-glow' : ''
      }`}
    >
      <header className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-in-out ${styles.icon}`}
        >
          <DeviceIcon kind={kind} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white" title={name}>
            {name}
          </h3>
          {subtitle && (
            <p className="truncate text-xs text-slate-500" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
        {battery !== null && <BatteryBadge level={battery} />}
      </header>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`truncate text-2xl font-semibold transition-colors duration-300 ease-in-out ${
              primary.numeric ? 'font-mono tabular-nums' : ''
            } ${styles.state}`}
          >
            {primary.text}
          </p>
          {alerts.length > 0 && (
            <p className="mt-0.5 truncate text-xs font-medium text-rose-300">
              {alerts.map((a) => a.message).join(' · ')}
            </p>
          )}
        </div>
        {canToggle && (
          <ToggleSwitch
            checked={isOn}
            label={`Turn ${name} ${isOn ? 'off' : 'on'}`}
            onChange={(next) => void onCommand(device.id, next ? 'on' : 'off', undefined, { switch: next ? 'on' : 'off' })}
          />
        )}
      </div>

      {readings.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {readings.map((r) => (
            <div key={r.key} className="flex items-baseline gap-1.5">
              <dt className="text-xs text-slate-500">{r.label}</dt>
              <dd className="font-mono text-sm tabular-nums text-slate-200">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(canDim || canColor || isLock || isThermostat) && (
        <div className="space-y-3 border-t border-white/[0.06] pt-3">
          {canDim && (
            <DimmerSlider
              level={level}
              label={name}
              onCommit={(v) => onCommand(device.id, 'setLevel', v, { level: v, switch: v > 0 ? 'on' : 'off' })}
            />
          )}
          {canColor && (
            <ColorPicker
              color={deviceColorHex(device)}
              level={level || 100}
              label={name}
              onCommit={(c) =>
                onCommand(device.id, 'setColor', JSON.stringify(c), {
                  hue: c.hue,
                  saturation: c.saturation,
                  level: c.level,
                  switch: 'on',
                })
              }
            />
          )}
          {isLock && (
            <LockControl
              name={name}
              state={attrString(device, 'lock')}
              onLock={() => onCommand(device.id, 'lock', undefined, { lock: 'locked' })}
              onUnlock={() => onCommand(device.id, 'unlock', undefined, { lock: 'unlocked' })}
            />
          )}
          {isThermostat && <ThermostatControl device={device} onCommand={onCommand} />}
        </div>
      )}
    </article>
  );
}

export const DeviceCard = memo(DeviceCardInner);
