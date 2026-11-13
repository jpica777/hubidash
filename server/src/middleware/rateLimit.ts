import rateLimit from 'express-rate-limit';

/** 100 requests per minute per client IP across all /api routes. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

/** Extra brute-force protection on login: 10 failed attempts per 15 minutes per IP. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});
