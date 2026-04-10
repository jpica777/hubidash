import { useState } from 'react';
import { Device, CommandRequest } from '../types/devices';
import {
  getDeviceIcon,
  getDeviceStatus,
  getDeviceCategory,
  hasBattery,
  getBatteryLevel,
  isBatteryLow,
  hasAlerts,
} from '../utils/deviceHelpers';
import ToggleSwitch from './controls/ToggleSwitch';
import DimmerSlider from './controls/DimmerSlider';
import LockControl from './controls/LockControl';
import ColorPicker from './controls/ColorPicker';
import ThermostatControl from './controls/ThermostatControl';

interface DeviceCardProps {
  device: Device;
  onSendCommand: (cmd: CommandRequest) => Promise<boolean>;
  stale?: boolean;
}

export default function DeviceCard({ device, onSendCommand, stale }: DeviceCardProps) {
  const [busy, setBusy] = useState(false);
  const { status, color } = getDeviceStatus(device);
  const icon = getDeviceIcon(device);
  const batteryLevel = getBatteryLevel(device);
  const batteryLow = isBatteryLow(device);
  const alert = hasAlerts(device);
  const category = getDeviceCategory(device);

  const exec = async (cmd: CommandRequest) => {
    setBusy(true);
    await onSendCommand(cmd);
    setBusy(false);
  };

  const borderClass = alert
    ? 'border-red-500/50'
    : color === 'green'
    ? 'border-green-500/30'
    : 'border-border';

  const glowClass = alert
    ? 'shadow-[0_0_14px_rgba(239,68,68,0.12)]'
    : color === 'green'
    ? 'shadow-[0_0_14px_rgba(74,222,128,0.07)]'
    : '';

  function renderControls() {
    const caps = device.capabilities;
    const attrs = device.attributes;

    // Sensors are always read-only
    if (category === 'sensors') return null;

    if (caps.includes('Lock')) {
      return (
        <LockControl
          deviceName={device.label}
          locked={attrs['lock'] === 'locked'}
          onLock={() => exec({ command: 'lock' })}
          onUnlock={() => exec({ command: 'unlock' })}
          disabled={busy}
        />
      );
    }

    if (caps.includes('Thermostat')) {
      const temperature = typeof attrs['temperature'] === 'number' ? attrs['temperature'] : undefined;
      const setpoint = typeof attrs['thermostatSetpoint'] === 'number' ? attrs['thermostatSetpoint'] : undefined;
      const mode = typeof attrs['thermostatMode'] === 'string' ? attrs['thermostatMode'] : 'off';
      return (
        <ThermostatControl
          temperature={temperature}
          setpoint={setpoint}
          mode={mode}
          onModeChange={(m: string) => exec({ command: 'setThermostatMode', value: m })}
          onSetpointChange={(t: number) => exec({ command: 'setHeatingSetpoint', value: t })}
          disabled={busy}
        />
      );
    }

    if (caps.includes('ColorControl')) {
      const colorVal = typeof attrs['color'] === 'string' ? attrs['color'] : undefined;
      return (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Power</span>
            <ToggleSwitch
              checked={attrs['switch'] === 'on'}
              onChange={(on: boolean) => exec({ command: on ? 'on' : 'off' })}
              disabled={busy}
            />
          </div>
          <ColorPicker
            color={colorVal}
            onChange={(c: string) => exec({ command: 'setColor', value: c })}
            disabled={busy}
          />
        </>
      );
    }

    if (caps.includes('SwitchLevel')) {
      const level = typeof attrs['level'] === 'number' ? attrs['level'] : 0;
      return (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Power</span>
            <ToggleSwitch
              checked={attrs['switch'] === 'on'}
              onChange={(on: boolean) => exec({ command: on ? 'on' : 'off' })}
              disabled={busy}
            />
          </div>
          <DimmerSlider
            value={level}
            onChange={(v: number) => exec({ command: 'setLevel', value: v })}
            disabled={busy}
          />
        </>
      );
    }

    if (caps.includes('Switch')) {
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Power</span>
          <ToggleSwitch
            checked={attrs['switch'] === 'on'}
            onChange={(on: boolean) => exec({ command: on ? 'on' : 'off' })}
            disabled={busy}
          />
        </div>
      );
    }

    return null;
  }

  return (
    <div
      className={`glass rounded-xl p-4 border transition-all duration-300 ${borderClass} ${glowClass}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">{device.label}</p>
            <p className="text-xs text-muted truncate">{device.type}</p>
          </div>
        </div>
        {stale && <span className="text-xs text-yellow-400 shrink-0 ml-1">stale</span>}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted">Status</span>
        <span
          className={`text-sm font-mono font-medium ${
            color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-gray-300'
          }`}
        >
          {status}
        </span>
      </div>

      {/* Battery */}
      {hasBattery(device) && batteryLevel !== null && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted">Battery</span>
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  batteryLow ? 'bg-red-500' : 'bg-green-500'
                }`}
                style={{ width: `${batteryLevel}%` }}
              />
            </div>
            <span className={`text-xs font-mono ${batteryLow ? 'text-red-400' : 'text-green-400'}`}>
              {batteryLevel}%
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3">{renderControls()}</div>
    </div>
  );
}
