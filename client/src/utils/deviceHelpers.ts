import type {
  AttributeValue,
  Device,
  DeviceAlert,
  DeviceCategory,
  DeviceKind,
  DeviceReading,
  StatusTone,
} from '../types/devices';

export const LOW_BATTERY_THRESHOLD = 20;

/* ------------------------------------------------------------------ */
/* Type detection                                                      */
/* ------------------------------------------------------------------ */

/** Exact Hubitat driver names (lower-cased) mapped to a device kind. */
const KNOWN_TYPES: Record<string, DeviceKind> = {
  'generic z-wave plus switch': 'switch',
  'generic z-wave switch': 'switch',
  'generic z-wave smart switch': 'switch',
  'generic zigbee switch': 'switch',
  'generic zigbee outlet': 'switch',
  'virtual switch': 'switch',
  'generic z-wave plus dimmer': 'dimmer',
  'generic z-wave dimmer': 'dimmer',
  'generic z-wave smart dimmer': 'dimmer',
  'generic zigbee dimmer': 'dimmer',
  'generic zigbee bulb': 'dimmer',
  'virtual dimmer': 'dimmer',
  'generic zigbee rgbw light': 'color',
  'generic zigbee rgb light': 'color',
  'generic zigbee ct bulb': 'dimmer',
  'advanced zigbee rgbw bulb': 'color',
  'virtual rgbw light': 'color',
  'generic z-wave lock': 'lock',
  'generic zigbee lock': 'lock',
  'virtual lock': 'lock',
  'generic z-wave thermostat': 'thermostat',
  'generic zigbee thermostat': 'thermostat',
  'virtual thermostat': 'thermostat',
  'zooz zse42 water leak sensor': 'water',
  'zooz zse42 water sensor': 'water',
  'zooz water leak sensor': 'water',
  'generic z-wave water sensor': 'water',
  'generic zigbee moisture sensor': 'water',
  'virtual moisture sensor': 'water',
  'generic z-wave contact sensor': 'contact',
  'generic zigbee contact sensor': 'contact',
  'generic zigbee contact sensor (no temp)': 'contact',
  'virtual contact sensor': 'contact',
  'generic z-wave motion sensor': 'motion',
  'generic zigbee motion sensor': 'motion',
  'generic zigbee motion sensor (no temp)': 'motion',
  'virtual motion sensor': 'motion',
  'generic zigbee temperature sensor': 'temperature',
  'generic zigbee temperature/humidity sensor': 'temperature',
  'virtual temperature sensor': 'temperature',
  'virtual humidity sensor': 'temperature',
};

/** Driver-name patterns, checked in order when the exact name isn't known. */
const TYPE_PATTERNS: Array<[RegExp, DeviceKind]> = [
  [/water|leak|flood|moisture|zse42/i, 'water'],
  [/thermostat|hvac/i, 'thermostat'],
  [/\block\b|deadbolt/i, 'lock'],
  [/rgbw?|color/i, 'color'],
  [/dimmer/i, 'dimmer'],
  [/motion|occupancy|presence sensor/i, 'motion'],
  [/contact|door\/window|tilt/i, 'contact'],
  [/temp|humidity|climate sensor/i, 'temperature'],
  [/switch|outlet|plug|relay|bulb|light/i, 'switch'],
];

export function hasCapability(device: Device, capability: string): boolean {
  const target = capability.toLowerCase();
  return device.capabilities.some((c) => c.toLowerCase() === target);
}

/** Capability implied by a command, used when the hub didn't send a command list. */
const COMMAND_CAPABILITY: Record<string, string> = {
  on: 'Switch',
  off: 'Switch',
  setLevel: 'SwitchLevel',
  setColor: 'ColorControl',
  lock: 'Lock',
  unlock: 'Lock',
  setThermostatMode: 'Thermostat',
  setHeatingSetpoint: 'Thermostat',
  setCoolingSetpoint: 'Thermostat',
};

export function hasCommand(device: Device, command: string): boolean {
  if (device.commands.length > 0) return device.commands.includes(command);
  const cap = COMMAND_CAPABILITY[command];
  return cap ? hasCapability(device, cap) : false;
}

function kindFromCapabilities(device: Device): DeviceKind {
  if (hasCapability(device, 'Thermostat')) return 'thermostat';
  if (hasCapability(device, 'Lock')) return 'lock';
  if (hasCapability(device, 'ColorControl')) return 'color';
  if (hasCapability(device, 'SwitchLevel') && hasCapability(device, 'Switch')) return 'dimmer';
  if (hasCapability(device, 'Switch')) return 'switch';
  if (hasCapability(device, 'WaterSensor')) return 'water';
  if (hasCapability(device, 'ContactSensor')) return 'contact';
  if (hasCapability(device, 'MotionSensor')) return 'motion';
  if (hasCapability(device, 'TemperatureMeasurement') || hasCapability(device, 'RelativeHumidityMeasurement')) {
    return 'temperature';
  }
  if (device.capabilities.some((c) => /sensor|measurement|detector/i.test(c))) return 'sensor';

  // Last resort: infer from attributes present.
  const a = device.attributes;
  if ('thermostatMode' in a) return 'thermostat';
  if ('lock' in a) return 'lock';
  if ('switch' in a) return 'level' in a ? 'dimmer' : 'switch';
  if ('water' in a) return 'water';
  if ('contact' in a) return 'contact';
  if ('motion' in a) return 'motion';
  if ('temperature' in a || 'humidity' in a) return 'temperature';
  return 'other';
}

export function detectKind(device: Device): DeviceKind {
  const type = device.type.trim().toLowerCase();
  const known = KNOWN_TYPES[type];
  if (known) return known;
  for (const [pattern, kind] of TYPE_PATTERNS) {
    if (pattern.test(type)) return kind;
  }
  return kindFromCapabilities(device);
}

export function getCategory(kind: DeviceKind): DeviceCategory {
  switch (kind) {
    case 'switch':
    case 'dimmer':
    case 'color':
      return 'lights';
    case 'lock':
      return 'locks';
    case 'thermostat':
      return 'climate';
    case 'water':
    case 'contact':
    case 'motion':
    case 'temperature':
    case 'sensor':
      return 'sensors';
    default:
      return 'other';
  }
}

/* ------------------------------------------------------------------ */
/* Attribute helpers                                                   */
/* ------------------------------------------------------------------ */

export function displayName(device: Device): string {
  return device.label || device.name;
}

export function toNumber(value: AttributeValue | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function attrString(device: Device, key: string): string | null {
  const v = device.attributes[key];
  return v === null || v === undefined ? null : String(v);
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function round1(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatTemperature(value: AttributeValue | undefined): string | null {
  const n = toNumber(value);
  return n === null ? null : `${round1(n)}°`;
}

export function getBattery(device: Device): number | null {
  if (!('battery' in device.attributes) && !hasCapability(device, 'Battery')) return null;
  const n = toNumber(device.attributes.battery);
  return n === null ? null : Math.max(0, Math.min(100, Math.round(n)));
}

/** Parses supportedThermostatModes, which Hubitat sends as JSON ('["heat","cool"]') or loose ('[heat, cool]'). */
export function parseModeList(raw: AttributeValue | undefined, fallback: string[]): string[] {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const text = String(raw).trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const modes = parsed.map((m) => String(m).trim()).filter(Boolean);
      if (modes.length) return modes;
    }
  } catch {
    // fall through to loose parsing
  }
  const modes = text
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((m) => m.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return modes.length ? modes : fallback;
}

/* ------------------------------------------------------------------ */
/* State presentation                                                  */
/* ------------------------------------------------------------------ */

export interface PrimaryState {
  text: string;
  /** Attribute the primary text was derived from, so it isn't repeated in readings. */
  attr: string | null;
  numeric: boolean;
}

function fromAttr(device: Device, attr: string, labels?: Record<string, string>): PrimaryState | null {
  const v = attrString(device, attr);
  if (v === null) return null;
  return { text: labels?.[v] ?? capitalize(v), attr, numeric: false };
}

export function getPrimaryState(device: Device, kind: DeviceKind): PrimaryState {
  const none: PrimaryState = { text: '—', attr: null, numeric: false };
  const temp = (): PrimaryState | null => {
    const t = formatTemperature(device.attributes.temperature);
    return t ? { text: t, attr: 'temperature', numeric: true } : null;
  };

  switch (kind) {
    case 'switch':
    case 'dimmer':
    case 'color':
      return fromAttr(device, 'switch') ?? none;
    case 'lock':
      return fromAttr(device, 'lock') ?? none;
    case 'water':
      return fromAttr(device, 'water', { wet: 'Leak detected', dry: 'Dry' }) ?? none;
    case 'contact':
      return fromAttr(device, 'contact') ?? none;
    case 'motion':
      return fromAttr(device, 'motion') ?? none;
    case 'temperature':
    case 'thermostat':
      return temp() ?? none;
    default:
      return (
        fromAttr(device, 'switch') ??
        fromAttr(device, 'water', { wet: 'Leak detected', dry: 'Dry' }) ??
        fromAttr(device, 'contact') ??
        fromAttr(device, 'motion') ??
        fromAttr(device, 'presence') ??
        temp() ??
        none
      );
  }
}

/** Secondary read-only values shown under the primary state. */
export function getReadings(device: Device, exclude: string | null): DeviceReading[] {
  const a = device.attributes;
  const readings: DeviceReading[] = [];
  const push = (key: string, label: string, value: string | null) => {
    if (value !== null && key !== exclude) readings.push({ key, label, value });
  };

  push('temperature', 'Temp', formatTemperature(a.temperature));
  const humidity = toNumber(a.humidity);
  push('humidity', 'Humidity', humidity === null ? null : `${Math.round(humidity)}%`);
  const lux = toNumber(a.illuminance);
  push('illuminance', 'Light', lux === null ? null : `${Math.round(lux)} lx`);
  const power = toNumber(a.power);
  push('power', 'Power', power === null ? null : `${round1(power)} W`);
  if (exclude !== 'motion' && a.motion !== undefined && a.motion !== null) {
    push('motion', 'Motion', capitalize(String(a.motion)));
  }
  if (exclude !== 'contact' && a.contact !== undefined && a.contact !== null) {
    push('contact', 'Contact', capitalize(String(a.contact)));
  }
  if (exclude !== 'water' && a.water !== undefined && a.water !== null) {
    push('water', 'Water', String(a.water) === 'wet' ? 'Wet' : 'Dry');
  }
  return readings;
}

export function getAlerts(device: Device): DeviceAlert[] {
  const name = displayName(device);
  const a = device.attributes;
  const alerts: DeviceAlert[] = [];

  if (a.water === 'wet') {
    alerts.push({ deviceId: device.id, deviceName: name, kind: 'water', message: 'Water detected', banner: true });
  }
  if (a.smoke === 'detected') {
    alerts.push({ deviceId: device.id, deviceName: name, kind: 'smoke', message: 'Smoke detected', banner: true });
  }
  if (a.carbonMonoxide === 'detected') {
    alerts.push({ deviceId: device.id, deviceName: name, kind: 'co', message: 'Carbon monoxide detected', banner: true });
  }
  const battery = getBattery(device);
  if (battery !== null && battery < LOW_BATTERY_THRESHOLD) {
    alerts.push({
      deviceId: device.id,
      deviceName: name,
      kind: 'battery',
      message: `Battery critical (${battery}%)`,
      banner: true,
    });
  }
  if (a.lock === 'unlocked') {
    alerts.push({ deviceId: device.id, deviceName: name, kind: 'unlocked', message: 'Unlocked', banner: false });
  }
  return alerts;
}

export function getStatusTone(device: Device): StatusTone {
  if (getAlerts(device).length > 0) return 'alert';
  const a = device.attributes;
  if (a.switch === 'on' || a.motion === 'active' || a.lock === 'locked') return 'active';
  return 'neutral';
}

/** Changes whenever any attribute changes; used to trigger the card glow. */
export function stateSignature(device: Device): string {
  return JSON.stringify(device.attributes);
}

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */

export function hsvToHex(hueDeg: number, sat: number, val: number): string {
  const h = ((hueDeg % 360) + 360) % 360;
  const c = val * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Current device color as hex, from Hubitat's hue (0-100) and saturation (0-100). */
export function deviceColorHex(device: Device): string {
  const hue = toNumber(device.attributes.hue) ?? 0;
  const sat = toNumber(device.attributes.saturation) ?? 0;
  return hsvToHex(hue * 3.6, sat / 100, 1);
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function valuesEqual(a: AttributeValue | undefined, b: AttributeValue | undefined): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) < 0.01;
  return String(a) === String(b);
}
