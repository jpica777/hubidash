import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { ConfigError, loadConfig, type AppConfig } from './config.js';
import { HubitatClient } from './services/hubitat.js';
import { DeviceCache } from './services/deviceCache.js';
import { WsManager } from './services/wsManager.js';
import { RuleClient } from './services/rules.js';
import { AutomationEngine } from './services/automationEngine.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { createAuthRouter } from './routes/auth.js';
import { createDevicesRouter } from './routes/devices.js';
import { createHealthRouter } from './routes/health.js';
import { createRulesRouter } from './routes/rules.js';
import { createAutomationsRouter } from './routes/automations.js';

const SESSION_COOKIE = 'hubidash.sid';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let config: AppConfig;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`[config] ${err.message}`);
    console.error('[config] See .env.example for the full list of variables.');
    process.exit(1);
  }
  throw err;
}

const port = parseInt(process.env.PORT || '3001', 10);

const hubitat = new HubitatClient(config.hubitat);
const cache = new DeviceCache(hubitat, config.pollIntervalMs);
const rules = new RuleClient(config.ruleMachine);
const automations = new AutomationEngine({
  client: hubitat,
  cache,
  dataDir: config.dataDir,
  timezone: config.timezone,
  location: config.location,
});
const passwordHash = bcrypt.hashSync(config.authPassword, 10);
const sessionStore = new session.MemoryStore();

const app = express();
// Railway (and most PaaS / NAS reverse proxies) sit in front of us. Must be set before
// any middleware, otherwise express-rate-limit rejects every request that carries X-Forwarded-For.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '32kb' }));
app.use(
  session({
    name: SESSION_COOKIE,
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      // 'auto' => Secure whenever the request arrived over HTTPS (Railway, via trust proxy),
      // plain cookie on http://localhost / LAN so local development keeps working.
      secure: 'auto',
      sameSite: 'lax',
      maxAge: THIRTY_DAYS_MS,
    },
  }),
);

const wsManager = new WsManager({ sessionStore, cache, client: hubitat });
automations.on('executed', (log) => wsManager.notifyAutomation(log));

app.use('/api', apiLimiter);
app.use('/api', createHealthRouter(hubitat.mode));
app.use(
  '/api',
  createAuthRouter({
    passwordHash,
    mode: hubitat.mode,
    cookieName: SESSION_COOKIE,
    revokeWsToken: (token) => wsManager.revokeToken(token),
  }),
);
app.use('/api/devices', createDevicesRouter(hubitat, cache));
app.use('/api/rules', createRulesRouter(rules));
app.use('/api/automations', createAutomationsRouter(automations));
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve the built React SPA.
const indexHtml = path.join(config.clientDistDir, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(
    '/assets',
    express.static(path.join(config.clientDistDir, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
  );
  app.use(express.static(config.clientDistDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
} else {
  console.warn(`[server] client build not found at ${config.clientDistDir} — API only (use the Vite dev server for the UI)`);
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 404 ? 'Not found' : 'Bad request' });
    return;
  }
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
wsManager.attach(server);

await automations.init();

server.listen(port, '0.0.0.0', () => {
  console.log(`[server] HubiDash listening on port ${port} (${hubitat.mode} mode, poll ${config.pollIntervalMs}ms)`);
  console.log(
    `[server] Rule Machine: ${rules.configured ? 'enabled' : 'not configured'} · timezone ${config.timezone}` +
      ` · sun conditions ${config.location ? 'enabled' : 'off (set LATITUDE/LONGITUDE)'}`,
  );
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received, shutting down`);
  automations.stop();
  wsManager.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
