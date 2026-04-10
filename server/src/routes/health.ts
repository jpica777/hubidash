import { Router, Request, Response } from 'express';
import { deviceCache } from '../services/deviceCache';
import { wsManager } from '../services/wsManager';

const router = Router();

// Public — no auth required
router.get('/health', (_req: Request, res: Response) => {
  const cached = deviceCache.getCachedState();
  return res.json({
    status: 'ok',
    mode: process.env.HUBITAT_MODE || 'local',
    uptime: process.uptime(),
    devicesLoaded: cached.devices.length,
    stale: cached.stale,
    lastUpdated: cached.lastUpdated,
    wsClients: wsManager.getConnectedCount(),
  });
});

export default router;
