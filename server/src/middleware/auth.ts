import type { NextFunction, Request, Response } from 'express';

/** Rejects requests without an authenticated session. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.authenticated === true) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}
