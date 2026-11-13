import { Router } from 'express';
import type { HubitatMode } from '../types/index.js';

export function createHealthRouter(mode: HubitatMode): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode, uptime: Math.round(process.uptime()) });
  });

  return router;
}
