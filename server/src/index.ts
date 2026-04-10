import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { createServer, IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';

import authRoutes from './routes/auth';
import deviceRoutes from './routes/devices';
import healthRoutes from './routes/health';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { wsManager } from './services/wsManager';
import { deviceCache } from './services/deviceCache';

const app = express();
const server = createServer(app);

// WebSocket server — only accepts connections on /ws path (see upgrade handler below)
const wss = new WebSocketServer({ noServer: true });

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// Rate limit all /api routes
app.use('/api', rateLimitMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api', authRoutes);
app.use('/api', authMiddleware, deviceRoutes);
app.use('/api', healthRoutes);

// ── Static (React SPA) ────────────────────────────────────────────────────────
// In production: __dirname = /app/server/dist/ → ../../dist = /app/dist/ (Vite output)
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'), (err: NodeJS.ErrnoException) => {
    if (err) {
      res.status(404).json({ error: 'Client not built. Run: npm run build -w client' });
    }
  });
});

// ── WebSocket upgrade (only /ws) ──────────────────────────────────────────────

server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  wsManager.handleConnection(ws, req);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;

server.listen(PORT, () => {
  console.log(`[HubiDash] Server listening on port ${PORT}`);
  console.log(`[HubiDash] Hubitat mode: ${process.env.HUBITAT_MODE || 'local'}`);

  wsManager.initialize();

  try {
    deviceCache.startPolling();
  } catch (err: unknown) {
    console.error(
      '[HubiDash] Failed to start polling:',
      err instanceof Error ? err.message : err
    );
    console.error('[HubiDash] Check your HUBITAT_* environment variables.');
  }
});

server.on('error', (err: Error) => {
  console.error('[HubiDash] Server error:', err);
  process.exit(1);
});
