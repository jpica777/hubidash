import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { DeviceCache } from '../services/deviceCache.js';
import { HubitatError, type HubitatClient } from '../services/hubitat.js';
import { CommandError, executeCommand, isValidDeviceId, parseCommandInput } from '../services/commands.js';

export function createDevicesRouter(client: HubitatClient, cache: DeviceCache): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (_req, res, next) => {
    try {
      const snapshot = await cache.getSnapshot();
      if (!cache.hasData) {
        res.status(502).json({ error: 'Hub unreachable and no cached state available', ...snapshot });
        return;
      }
      res.json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      res.status(400).json({ error: 'Invalid device id' });
      return;
    }
    try {
      const device = await client.getDevice(id);
      res.json({ device, stale: false });
    } catch (err) {
      if (err instanceof HubitatError) {
        const cached = cache.get(id);
        if (cached) {
          res.json({ device: cached, stale: true });
          return;
        }
        res.status(err.status === 404 ? 404 : 502).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/:id/command', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { command?: unknown; value?: unknown };
      const input = parseCommandInput(req.params.id, body.command, body.value);
      await executeCommand(client, cache, input);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof CommandError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      next(err);
    }
  });

  return router;
}
