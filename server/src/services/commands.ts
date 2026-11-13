import type { DeviceCache } from './deviceCache.js';
import { HubitatError, type HubitatClient } from './hubitat.js';
import type { CommandInput } from '../types/index.js';

export class CommandError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

const DEVICE_ID_RE = /^\d{1,10}$/;
const COMMAND_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_VALUE_LENGTH = 256;

export function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === 'string' && DEVICE_ID_RE.test(deviceId);
}

/** Validates untrusted command input from REST or WebSocket. Throws CommandError(400) on bad input. */
export function parseCommandInput(deviceId: unknown, command: unknown, value: unknown): CommandInput {
  if (!isValidDeviceId(deviceId)) throw new CommandError('Invalid device id', 400);
  if (typeof command !== 'string' || !COMMAND_RE.test(command)) throw new CommandError('Invalid command', 400);

  if (value === undefined || value === null || value === '') return { deviceId, command };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CommandError('Invalid command value', 400);
    return { deviceId, command, value };
  }
  if (typeof value === 'string') {
    if (value.length > MAX_VALUE_LENGTH) throw new CommandError('Command value too long', 400);
    return { deviceId, command, value };
  }
  throw new CommandError('Command value must be a string or number', 400);
}

/** Validates against the device's known command list, sends it to the hub, and schedules a fast refresh. */
export async function executeCommand(
  client: HubitatClient,
  cache: DeviceCache,
  input: CommandInput,
): Promise<void> {
  const { deviceId, command, value } = input;
  const device = cache.get(deviceId);
  if (device && device.commands.length > 0 && !device.commands.includes(command)) {
    throw new CommandError(`Device "${device.label}" does not support command "${command}"`, 400);
  }

  console.log(
    `[command] deviceId=${deviceId} command=${command} value=${value === undefined ? '(none)' : String(value)}`,
  );

  try {
    await client.sendCommand(deviceId, command, value);
  } catch (err) {
    if (err instanceof HubitatError) throw new CommandError(err.message, 502);
    throw err;
  }
  cache.refreshSoon();
}
