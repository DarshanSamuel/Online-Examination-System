import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { adminAuth } from '../config/firebase.js';
import { HttpError } from '../lib/errors.js';
import type { Role } from '../types/schema.js';

export interface AuthedUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/**
 * Verifies the Firebase ID token and enforces Google sign-in.
 * `checkRevoked=true` lets an examiner kill a session by revoking refresh tokens.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!match) return next(new HttpError(401, 'Missing bearer token', 'UNAUTHENTICATED'));

  try {
    const decoded = await adminAuth.verifyIdToken(match[1]!, true);
    if (decoded.firebase.sign_in_provider !== 'google.com') {
      return next(new HttpError(403, 'Google sign-in is required', 'PROVIDER_NOT_ALLOWED'));
    }
    if (!decoded.email || !decoded.email_verified) {
      return next(new HttpError(403, 'Verified email required', 'EMAIL_UNVERIFIED'));
    }
    req.user = {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      name: (decoded.name as string | undefined) ?? decoded.email,
      role: decoded.role === 'examiner' ? 'examiner' : 'candidate',
    };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token', 'UNAUTHENTICATED'));
  }
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) =>
    req.user?.role === role ? next() : next(new HttpError(403, 'Forbidden', 'FORBIDDEN'));

/** Per-user limiter. Must be mounted after requireAuth. */
export const userRateLimit = (limitPerMinute: number) =>
  rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user!.uid,
    handler: (_req, _res, next) => next(new HttpError(429, 'Too many requests, slow down', 'RATE_LIMITED')),
  });

/** Typed accessor so handlers don't need non-null assertions everywhere. */
export function currentUser(req: Express.Request): AuthedUser {
  if (!req.user) throw new HttpError(401, 'Unauthenticated', 'UNAUTHENTICATED');
  return req.user;
}
