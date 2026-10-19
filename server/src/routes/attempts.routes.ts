import { Router } from 'express';
import { env } from '../config/env.js';
import { currentUser, requireAuth, userRateLimit } from '../middleware/auth.js';
import { syncAnswers } from '../services/attempts/answers.js';
import { finalizeAttempt, loadOwnedSubmission, startAttempt } from '../services/attempts/lifecycle.js';
import { appendKeystrokes, recordProctorEvents } from '../services/attempts/proctoring.js';
import { runCandidateCode } from '../services/attempts/runs.js';
import { getAttemptResult, getAttemptView } from '../services/attempts/view.js';
import { isHttpError } from '../lib/errors.js';
import {
  docId,
  keystrokeChunkSchema,
  proctorEventsSchema,
  runBodySchema,
  submitBodySchema,
  syncBodySchema,
} from '../validation/schemas.js';

export const attemptsRouter = Router();
attemptsRouter.use(requireAuth, userRateLimit(240));

/** Start or resume. Returns server-authoritative deadline + serverNow for clock-offset calc. */
attemptsRouter.post('/exams/:examId/start', async (req, res) => {
  const examId = docId.parse(req.params.examId);
  const result = await startAttempt(currentUser(req), examId, {
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    ip: req.ip ?? null,
  });
  res.status(result.resumed ? 200 : 201).json(result);
});

/** Outcome of the caller's own attempt; scores appear only if the examiner released them. */
attemptsRouter.get('/exams/:examId/result', async (req, res) => {
  res.json(await getAttemptResult(currentUser(req), docId.parse(req.params.examId)));
});

/** Sanitized questions (shuffled, no answer keys / hidden tests) + saved answers. */
attemptsRouter.get('/:submissionId', async (req, res) => {
  res.json(await getAttemptView(currentUser(req), docId.parse(req.params.submissionId)));
});

/** Autosave — called every 30s and on reconnect with the offline queue. */
attemptsRouter.post('/:submissionId/sync', async (req, res) => {
  const { answers } = syncBodySchema.parse(req.body);
  res.json(await syncAnswers(currentUser(req), docId.parse(req.params.submissionId), answers));
});

attemptsRouter.post('/:submissionId/events', async (req, res) => {
  const { events } = proctorEventsSchema.parse(req.body);
  res.json(await recordProctorEvents(currentUser(req), docId.parse(req.params.submissionId), events));
});

attemptsRouter.post('/:submissionId/keystrokes', async (req, res) => {
  const chunk = keystrokeChunkSchema.parse(req.body);
  res.json(await appendKeystrokes(currentUser(req), docId.parse(req.params.submissionId), chunk));
});

/** Sandbox calls are expensive: strict per-user limit. */
attemptsRouter.post('/:submissionId/run', userRateLimit(env.RUN_RATE_LIMIT_PER_MIN), async (req, res) => {
  const body = runBodySchema.parse(req.body);
  res.json(await runCandidateCode(currentUser(req), docId.parse(req.params.submissionId), body));
});

/**
 * Final submit. Optional `answers` lets the client flush its last unsynced edits atomically
 * with the submit click. Grading happens asynchronously on the server.
 */
attemptsRouter.post('/:submissionId/submit', async (req, res) => {
  const user = currentUser(req);
  const id = docId.parse(req.params.submissionId);
  const body = submitBodySchema.parse(req.body);

  if (body.answers?.length) {
    try {
      await syncAnswers(user, id, body.answers);
    } catch (err) {
      // Past the grace window the last flush is dropped, but the submit still goes through.
      if (!isHttpError(err, 'ATTEMPT_EXPIRED') && !isHttpError(err, 'ATTEMPT_CLOSED')) throw err;
    }
  }

  await loadOwnedSubmission(id, user.uid); // ownership check before finalizing
  const { alreadyFinalized } = await finalizeAttempt(id, body.reason);
  res.status(202).json({ submissionId: id, alreadyFinalized, status: 'submitted' });
});
