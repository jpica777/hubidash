import { Router, Request, Response } from 'express';
import { hubitatClient } from '../services/hubitat';
import { deviceCache } from '../services/deviceCache';

const router = Router();

router.get('/devices', async (_req: Request, res: Response) => {
  try {
    const devices = await hubitatClient.getAllDevices();
    await deviceCache.updateDevices(devices);
    return res.json(devices);
  } catch (err) {
    console.error('[devices] Error fetching all devices:', err);
    const cached = deviceCache.getCachedState();
    if (cached.devices.length > 0) {
      return res.json(cached.devices.map((d) => ({ ...d, stale: true })));
    }
    return res.status(502).json({ error: 'Hub unreachable and no cached state available' });
  }
});

router.get('/devices/:id', async (req: Request, res: Response) => {
  try {
    const device = await hubitatClient.getDevice(req.params.id);
    return res.json(device);
  } catch (err) {
    console.error('[devices] Error fetching device:', err);
    // Fall back to cache
    const cached = deviceCache.getCachedState().devices.find((d) => d.id === req.params.id);
    if (cached) return res.json({ ...cached, stale: true });
    return res.status(404).json({ error: 'Device not found' });
  }
});

router.post('/devices/:id/command', async (req: Request, res: Response) => {
  const { command, value } = req.body as { command?: string; value?: string | number };

  if (!command) {
    return res.status(400).json({ error: 'command is required' });
  }

  const deviceId = req.params.id;
  console.log(`[devices] sendCommand → deviceId=${deviceId} command=${command} value=${value ?? '(none)'}`);

  try {
    await hubitatClient.sendCommand(deviceId, command, value);
    return res.json({ success: true });
  } catch (err) {
    console.error('[devices] Error sending command:', err);
    return res.status(502).json({ error: 'Failed to send command to hub' });
  }
});

export default router;
