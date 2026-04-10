import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { registerWsToken, revokeWsToken } from '../services/wsManager';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const rawPassword = process.env.AUTH_PASSWORD;
if (!rawPassword) {
  throw new Error('AUTH_PASSWORD environment variable is required');
}

const hashedPassword = bcrypt.hashSync(rawPassword, 10);

router.post('/login', async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    const isValid = await bcrypt.compare(password, hashedPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate a WS token tied to this session
    const wsToken = crypto.randomBytes(32).toString('hex');
    req.session.authenticated = true;
    req.session.wsToken = wsToken;
    registerWsToken(wsToken);

    return res.json({ success: true, wsToken });
  } catch (err) {
    console.error('[auth] Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  const wsToken = req.session.wsToken;
  if (wsToken) revokeWsToken(wsToken);

  req.session.destroy((err) => {
    if (err) {
      console.error('[auth] Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// Used by the client on load to verify an existing session is still valid
// and to retrieve the WS token without logging in again
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  return res.json({
    authenticated: true,
    wsToken: req.session.wsToken,
  });
});

export default router;
