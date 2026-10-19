import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { sweepOnce } from '../jobs/sweeper.js';
import { HttpError } from '../lib/errors.js';

export const internalRouter = Router();

function bearerMatches(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Serverless replacement for the in-process sweeper interval.
 * Triggered by Vercel Cron (see server/vercel.json). Vercel Cron issues GET requests.
 */
internalRouter.get('/sweep', async (req, res) => {
  if (!env.CRON_SECRET || !bearerMatches(req.headers.authorization, env.CRON_SECRET)) {
    throw new HttpError(401, 'Unauthorized', 'UNAUTHENTICATED');
  }
  await sweepOnce();
  res.json({ ok: true, at: Date.now() });
});
