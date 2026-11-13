import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import type { HubitatOptions } from './services/hubitat.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root: works from both server/src (tsx) and server/dist (compiled). */
export const ROOT_DIR = path.resolve(here, '..', '..');

// Load .env from the repo root if present. In Docker/Railway the env is injected directly.
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface AppConfig {
  hubitat: HubitatOptions;
  pollIntervalMs: number;
  authPassword: string;
  sessionSecret: string;
  clientDistDir: string;
}

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function requireEnv(name: string, purpose: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new ConfigError(`Missing required environment variable ${name} (${purpose})`);
  }
  return value;
}

function normalizeHost(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

export function loadConfig(): AppConfig {
  const modeRaw = (readEnv('HUBITAT_MODE') || 'cloud').toLowerCase();
  if (modeRaw !== 'local' && modeRaw !== 'cloud') {
    throw new ConfigError(`HUBITAT_MODE must be "local" or "cloud" (got "${modeRaw}")`);
  }

  const appId = requireEnv('HUBITAT_APP_ID', 'Maker API app ID');
  if (!/^\d+$/.test(appId)) {
    throw new ConfigError(`HUBITAT_APP_ID must be numeric (got "${appId}")`);
  }

  let hubitat: HubitatOptions;
  if (modeRaw === 'local') {
    hubitat = {
      mode: 'local',
      host: normalizeHost(requireEnv('HUBITAT_HOST', 'hub LAN address, required in local mode')),
      appId,
      accessToken: requireEnv('HUBITAT_ACCESS_TOKEN', 'Maker API local token, required in local mode'),
    };
  } else {
    hubitat = {
      mode: 'cloud',
      hubId: requireEnv('HUBITAT_HUB_ID', 'hub UUID, required in cloud mode'),
      appId,
      cloudToken: requireEnv('HUBITAT_CLOUD_TOKEN', 'Maker API cloud token, required in cloud mode'),
    };
  }

  const sessionSecret = requireEnv('SESSION_SECRET', 'session cookie signing secret');
  if (sessionSecret.length < 16) {
    throw new ConfigError('SESSION_SECRET must be at least 16 characters (use: openssl rand -hex 32)');
  }

  return {
    hubitat,
    pollIntervalMs: modeRaw === 'local' ? 5_000 : 8_000,
    authPassword: requireEnv('AUTH_PASSWORD', 'dashboard login password'),
    sessionSecret,
    clientDistDir: path.join(ROOT_DIR, 'client', 'dist'),
  };
}
