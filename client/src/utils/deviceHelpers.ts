import { Device, DeviceCategory } from '../types/devices';

export function getDeviceCategory(device: Device): DeviceCategory {
  const caps = device.capabilities;
  const type = device.type.toLowerCase();

  if (caps.includes('Thermostat') || caps.includes('ThermostatHeatingSetpoint')) return 'climate';
  if (caps.includes('Lock')) return 'locks';
  if (
    type.includes('sensor') ||
    caps.includes('WaterSensor') ||
    caps.includes('MotionSensor') ||
    caps.includes('ContactSensor') ||
    caps.includes('TemperatureMeasurement') ||
    caps.includes('RelativeHumidityMeasurement')
  )
    return 'sensors';
  if (caps.includes('Switch') || caps.includes('Light') || caps.includes('Bulb')) return 'lights';
  return 'other';
}

export function getDeviceIcon(device: Device): string {
  const caps = device.capabilities;
  const type = device.type.toLowerCase();

  if (caps.includes('Thermostat')) return '🌡️';
  if (caps.includes('Lock')) return '🔒';
  if (type.includes('water') || type.includes('leak') || caps.includes('WaterSensor')) return '💧';
  if (type.includes('motion') || caps.includes('MotionSensor')) return '👁️';
  if (type.includes('contact') || caps.includes('ContactSensor')) return '🚪';
  if (caps.includes('ColorControl') || caps.includes('ColorTemperature')) return '💡';
  if (caps.includes('Switch') || caps.includes('Light')) return '🔦';
  if (caps.includes('TemperatureMeasurement')) return '🌡️';
  return '📡';
}

export type StatusColor = 'green' | 'red' | 'neutral';

export function getDeviceStatus(device: Device): { status: string; color: StatusColor } {
  const attrs = device.attributes;
  const caps = device.capabilities;

  if (caps.includes('Lock')) {
    const locked = attrs['lock'] === 'locked';
    return { status: locked ? 'Locked' : 'Unlocked', color: locked ? 'green' : 'red' };
  }

  if (caps.includes('WaterSensor')) {
    const wet = attrs['water'] === 'wet';
    return { status: wet ? 'Wet' : 'Dry', color: wet ? 'red' : 'neutral' };
  }

  if (caps.includes('ContactSensor')) {
    const open = attrs['contact'] === 'open';
    return { status: open ? 'Open' : 'Closed', color: open ? 'neutral' : 'green' };
  }

  if (caps.includes('MotionSensor')) {
    const active = attrs['motion'] === 'active';
    return { status: active ? 'Motion' : 'Clear', color: active ? 'green' : 'neutral' };
  }

  if (caps.includes('Switch')) {
    const on = attrs['switch'] === 'on';
    return { status: on ? 'On' : 'Off', color: on ? 'green' : 'neutral' };
  }

  if (caps.includes('TemperatureMeasurement') && attrs['temperature'] != null) {
    return { status: `${attrs['temperature']}°F`, color: 'neutral' };
  }

  if (caps.includes('Thermostat')) {
    const temp = attrs['temperature'];
    const mode = attrs['thermostatMode'] ?? 'off';
    return { status: temp != null ? `${temp}°F · ${mode}` : String(mode), color: 'neutral' };
  }

  return { status: 'Unknown', color: 'neutral' };
}

export function hasBattery(device: Device): boolean {
  return device.capabilities.includes('Battery');
}

export function getBatteryLevel(device: Device): number | null {
  const v = device.attributes['battery'];
  return typeof v === 'number' ? v : null;
}

export function isBatteryLow(device: Device): boolean {
  const lvl = getBatteryLevel(device);
  return lvl !== null && lvl < 20;
}

export function hasAlerts(device: Device): boolean {
  return (
    isBatteryLow(device) ||
    device.attributes['water'] === 'wet' ||
    (device.capabilities.includes('Lock') && device.attributes['lock'] === 'unlocked')
  );
}
