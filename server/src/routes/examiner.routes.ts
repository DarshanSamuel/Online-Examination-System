import { Router } from 'express';
import { collections, db } from '../config/firebase.js';
import { HttpError } from '../lib/errors.js';
import { currentUser, requireAuth, requireRole, userRateLimit } from '../middleware/auth.js';
import { finalizeAttempt } from '../services/attempts/lifecycle.js';
import { assertExamOwner } from '../services/exams.js';
import { queueGrading } from '../services/grading/gradeSubmission.js';
import { runExamSimilarity } from '../services/plagiarism/similarity.js';
import type { SubmissionDoc } from '../types/schema.js';
import { docId, similarityBodySchema } from '../validation/schemas.js';

export const examinerRouter = Router();
examinerRouter.use(requireAuth, requireRole('examiner'), userRateLimit(120));

async function ownedSubmission(submissionId: string, examinerUid: string) {
  const sub = (await collections.submissions.doc(submissionId).get()).data() as SubmissionDoc | undefined;
  if (!sub) throw new HttpError(404, 'Submission not found', 'NOT_FOUND');
  await assertExamOwner(sub.examId, examinerUid);
  return sub;
}

/** Runs winnowing similarity across all finalized submissions of an exam. */
examinerRouter.post('/exams/:examId/similarity', userRateLimit(5), async (req, res) => {
  const { threshold } = similarityBodySchema.parse(req.body ?? {});
  res.json(await runExamSimilarity(docId.parse(req.params.examId), currentUser(req).uid, threshold));
});

/** Re-run grading (e.g., after fixing a broken hidden test case). */
examinerRouter.post('/submissions/:submissionId/regrade', async (req, res) => {
  const id = docId.parse(req.params.submissionId);
  const sub = await ownedSubmission(id, currentUser(req).uid);
  if (sub.status === 'in_progress') throw new HttpError(409, 'Attempt still in progress', 'IN_PROGRESS');
  queueGrading(id, { force: true });
  res.status(202).json({ submissionId: id, queued: true });
});

/** Force-submit a live attempt (e.g., proctor observed cheating). */
examinerRouter.post('/submissions/:submissionId/terminate', async (req, res) => {
  const id = docId.parse(req.params.submissionId);
  await ownedSubmission(id, currentUser(req).uid);
  res.json(await finalizeAttempt(id, 'examiner_terminated'));
});

/** Remove a single assigned candidate from an exam. */
examinerRouter.delete('/exams/:examId/assignments/:assignmentId', async (req, res) => {
  const examId = docId.parse(req.params.examId);
  const assignmentId = String(req.params.assignmentId);
  await assertExamOwner(examId, currentUser(req).uid);
  const asgRef = collections.assignments.doc(assignmentId);
  const snap = await asgRef.get();
  if (snap.exists) {
    await asgRef.delete();
  }
  res.json({ success: true });
});

/** Batch remove assigned candidates from an exam. */
examinerRouter.post('/exams/:examId/assignments/batch-remove', async (req, res) => {
  const examId = docId.parse(req.params.examId);
  const { assignmentIds } = req.body as { assignmentIds?: string[] };
  if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    throw new HttpError(400, 'assignmentIds array is required', 'INVALID_INPUT');
  }
  await assertExamOwner(examId, currentUser(req).uid);
  const batch = db.batch();
  for (const id of assignmentIds) {
    batch.delete(collections.assignments.doc(id));
  }
  await batch.commit();
  res.json({ success: true, count: assignmentIds.length });
});
