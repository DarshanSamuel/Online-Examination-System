import { Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env.js';
import { collections } from '../config/firebase.js';
import { logger } from '../lib/logger.js';
import { finalizeAttempt } from '../services/attempts/lifecycle.js';
import { gradeSubmission } from '../services/grading/gradeSubmission.js';

/** Upper bound on grace periods, so the query never closes an attempt that is still in grace. */
const MAX_GRACE_MS = 5 * 60_000;

/**
 * Safety net for when the client never calls /submit (closed laptop, killed tab, tampering).
 *  1. Finalizes in-progress attempts whose deadline + grace has passed.
 *  2. Retries grading for finalized-but-ungraded submissions.
 * Idempotent, so running it on several instances is safe (but wasteful). In production prefer
 * Cloud Scheduler → POST /internal/sweep, or a scheduled Cloud Function.
 */
export async function sweepOnce() {
  const now = Date.now();

  const expired = await collections.submissions
    .where('status', '==', 'in_progress')
    .where('timing.deadlineAt', '<', Timestamp.fromMillis(now - 15_000))
    .limit(100)
    .get();

  for (const doc of expired.docs) {
    const deadline = (doc.get('timing.deadlineAt') as Timestamp).toMillis();
    const grace = Math.min(((doc.get('examSnapshot.gracePeriodSec') as number) ?? 0) * 1000, MAX_GRACE_MS);
    if (now > deadline + grace) await finalizeAttempt(doc.id, 'timeout').catch((e) => logger.error('sweep finalize failed', { id: doc.id, err: (e as Error).message }));
  }

  const ungraded = await collections.submissions.where('status', 'in', ['submitted', 'grading', 'grading_failed']).limit(25).get();
  for (const doc of ungraded.docs) await gradeSubmission(doc.id); // canClaim() filters fresh locks & exhausted retries

  if (expired.size || ungraded.size) logger.info('Sweep complete', { expired: expired.size, ungraded: ungraded.size });
}

export function startSweeper() {
  if (!env.ENABLE_SWEEPER) return;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sweepOnce();
    } catch (e) {
      logger.error('Sweep failed', { err: (e as Error).message });
    } finally {
      running = false;
    }
  }, env.SWEEPER_INTERVAL_SEC * 1000);
  timer.unref();
}
