import { Router, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { RuleError, type RuleClient } from '../services/rules.js';

export function createRulesRouter(rules: RuleClient): Router {
  const router = Router();
  router.use(requireAuth);

  const handleError = (res: Response, err: unknown) => {
    if (err instanceof RuleError) {
      res.status(err.status).json({ ok: false, error: err.message });
      return;
    }
    console.error('[rules] unexpected error:', err);
    res.status(500).json({ ok: false, error: 'Rule Machine request failed' });
  };

  router.get('/status', (_req, res) => {
    res.json({ configured: rules.configured });
  });

  router.get('/', async (_req, res) => {
    try {
      res.json(await rules.getRules());
    } catch (err) {
      handleError(res, err);
    }
  });

  const actions: Record<string, (id: string) => Promise<void>> = {
    run: (id) => rules.runRuleActions(id),
    evaluate: (id) => rules.runRule(id),
    pause: (id) => rules.pauseRule(id),
    resume: (id) => rules.resumeRule(id),
  };

  for (const [action, fn] of Object.entries(actions)) {
    router.post(`/:id/${action}`, async (req, res) => {
      if (!rules.configured) {
        res.status(404).json({ ok: false, error: 'Rule Machine is not configured' });
        return;
      }
      try {
        await fn(req.params.id);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    });
  }

  return router;
}
