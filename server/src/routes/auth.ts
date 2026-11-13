import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { loginLimiter } from '../middleware/rateLimit.js';
import type { HubitatMode } from '../types/index.js';

interface AuthRouterOptions {
  passwordHash: string;
  mode: HubitatMode;
  cookieName: string;
  revokeWsToken: (token: string) => void;
}

export function createAuthRouter({ passwordHash, mode, cookieName, revokeWsToken }: AuthRouterOptions): Router {
  const router = Router();

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const body: unknown = req.body;
      const password =
        body && typeof body === 'object' && typeof (body as { password?: unknown }).password === 'string'
          ? (body as { password: string }).password
          : '';

      if (!password || password.length > 1024) {
        res.status(400).json({ error: 'Password is required' });
        return;
      }

      const valid = await bcrypt.compare(password, passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Incorrect password' });
        return;
      }

      const previousToken = req.session.wsToken;
      // Regenerate to prevent session fixation.
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          next(regenErr);
          return;
        }
        if (previousToken) revokeWsToken(previousToken);
        const wsToken = uuidv4();
        req.session.authenticated = true;
        req.session.wsToken = wsToken;
        req.session.save((saveErr) => {
          if (saveErr) {
            next(saveErr);
            return;
          }
          res.json({ authenticated: true, wsToken, mode });
        });
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res, next) => {
    const token = req.session.wsToken;
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      if (token) revokeWsToken(token);
      res.clearCookie(cookieName, { path: '/' });
      res.json({ authenticated: false });
    });
  });

  router.get('/me', (req, res) => {
    if (req.session.authenticated === true && req.session.wsToken) {
      res.json({ authenticated: true, wsToken: req.session.wsToken, mode });
      return;
    }
    res.status(401).json({ authenticated: false });
  });

  return router;
}
