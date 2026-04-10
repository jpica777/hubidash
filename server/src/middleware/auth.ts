import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.authenticated) {
    next();
    return;
  }
  res.status(401).json({ error: 'Authentication required' });
}
