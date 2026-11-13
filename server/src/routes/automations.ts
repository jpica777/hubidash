import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  AutomationNotFoundError,
  AutomationValidationError,
  type AutomationEngine,
} from '../services/automationEngine.js';

export function createAutomationsRouter(engine: AutomationEngine): Router {
  const router = Router();
  router.use(requireAuth);

  const handle =
    (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => async (req: Request, res: Response) => {
      try {
        const result = await fn(req, res);
        if (!res.headersSent) res.json(result);
      } catch (err) {
        if (err instanceof AutomationValidationError) {
          res.status(400).json({ error: err.message });
        } else if (err instanceof AutomationNotFoundError) {
          res.status(404).json({ error: err.message });
        } else {
          console.error('[automations] request failed:', err);
          const detail = err instanceof Error ? err.message : String(err);
          res.status(500).json({ error: `Could not save automations: ${detail}` });
        }
      }
    };

  // Fixed paths first so they aren't captured by "/:id".
  router.get('/', handle(() => engine.list()));
  router.get('/log', handle(() => engine.getLogs(50)));
  router.get('/meta', handle(() => engine.meta));
  router.post('/test', handle((req) => engine.testDraft(req.body)));

  router.get('/:id', handle((req) => engine.get(req.params.id)));
  router.post(
    '/',
    handle(async (req, res) => {
      const created = await engine.create(req.body);
      res.status(201).json(created);
    }),
  );
  router.put('/:id', handle((req) => engine.update(req.params.id, req.body)));
  router.delete(
    '/:id',
    handle(async (req) => {
      await engine.remove(req.params.id);
      return { ok: true };
    }),
  );
  router.post(
    '/:id/toggle',
    handle((req) => {
      const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled;
      return engine.toggle(req.params.id, typeof enabled === 'boolean' ? enabled : undefined);
    }),
  );
  router.post('/:id/test', handle((req) => engine.test(req.params.id)));

  return router;
}
