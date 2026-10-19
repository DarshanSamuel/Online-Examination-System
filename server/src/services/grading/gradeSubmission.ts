import { waitUntil } from '@vercel/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { answerKeyRef, collections, db } from '../../config/firebase.js';
import { logger } from '../../lib/logger.js';
import { mapLimit, round2 } from '../../lib/util.js';
import type { AnswerKeyDoc, QuestionDoc, QuestionGrade, QuestionMapEntry, SubmissionDoc } from '../../types/schema.js';
import { runner } from '../execution/index.js';
import { gradeCoding } from './code.js';
import { gradeMcq, gradeNumerical } from './objective.js';

export const MAX_GRADING_ATTEMPTS = 3;
const STALE_GRADING_MS = 10 * 60_000;

/** Decides whether this worker may take the grading lock. */
function canClaim(sub: SubmissionDoc, force: boolean): boolean {
  if (force) return sub.status !== 'in_progress';
  if (sub.status === 'submitted') return true;
  if (sub.status === 'grading_failed') return sub.grading.attempts < MAX_GRADING_ATTEMPTS;
  if (sub.status === 'grading') {
    const started = sub.grading.startedAt?.toMillis() ?? 0;
    return Date.now() - started > STALE_GRADING_MS; // previous worker probably died
  }
  return false;
}

/**
 * Grades a finalized submission entirely server-side from the frozen answers.
 * Safe to call concurrently / repeatedly: a transactional claim ensures one grader at a time.
 */
export async function gradeSubmission(submissionId: string, opts: { force?: boolean } = {}): Promise<void> {
  const ref = collections.submissions.doc(submissionId);

  const sub = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as SubmissionDoc;
    if (!canClaim(data, !!opts.force)) return null;
    tx.update(ref, {
      status: 'grading',
      'grading.startedAt': Timestamp.now(),
      'grading.attempts': FieldValue.increment(1),
    });
    return data;
  });
  if (!sub) return;

  try {
    const qRefs = sub.questionMap.map((e) => collections.questions.doc(e.questionId));
    const kRefs = sub.questionMap.map((e) => answerKeyRef(e.questionId));
    const snaps = await db.getAll(...qRefs, ...kRefs);
    const n = sub.questionMap.length;

    // Coding questions hit the sandbox; cap parallelism so one exam can't starve the pool.
    const grades = await mapLimit(sub.questionMap, 2, async (entry, i) => {
      const question = snaps[i]!.data() as QuestionDoc | undefined;
      const key = snaps[n + i]!.data() as AnswerKeyDoc | undefined;
      return [entry.questionId, await gradeOne(sub, entry, question, key)] as const;
    });

    const perQuestion = Object.fromEntries(grades) as Record<string, QuestionGrade>;
    const totalScore = round2(Object.values(perQuestion).reduce((s, g) => s + g.score, 0));
    const maxScore = round2(sub.questionMap.reduce((s, e) => s + e.points, 0));

    await ref.update({
      status: 'graded',
      'grading.perQuestion': perQuestion,
      'grading.totalScore': totalScore,
      'grading.maxScore': maxScore,
      'grading.gradedAt': Timestamp.now(),
      'grading.lastError': null,
    });
    logger.info('Submission graded', { submissionId, totalScore, maxScore });
  } catch (err) {
    logger.error('Grading failed', { submissionId, err: (err as Error).message });
    await ref.update({ status: 'grading_failed', 'grading.lastError': (err as Error).message.slice(0, 500) });
  }
}

async function gradeOne(
  sub: SubmissionDoc,
  entry: QuestionMapEntry,
  question: QuestionDoc | undefined,
  key: AnswerKeyDoc | undefined,
): Promise<QuestionGrade> {
  const points = entry.points;
  if (!question || !key || question.type !== key.type) {
    return { score: 0, maxScore: points, status: 'error', note: 'Question or answer key missing' };
  }
  if (question.version !== entry.questionVersion) {
    logger.warn('Question edited after attempt started', { submissionId: `${sub.examId}_${sub.candidateUid}`, questionId: entry.questionId });
  }

  const answer = sub.answers[entry.questionId];
  if (!answer) return { score: 0, maxScore: points, status: 'unanswered' };

  if (answer.type === 'mcq' && key.type === 'mcq') return gradeMcq(answer, key, points);
  if (answer.type === 'numerical' && key.type === 'numerical') return gradeNumerical(answer, key, points);
  if (answer.type === 'coding' && key.type === 'coding' && question.type === 'coding') {
    return gradeCoding(runner, question, key.hiddenTestCases, answer.language, answer.code, points);
  }
  return { score: 0, maxScore: points, status: 'error', note: 'Answer type mismatch' };
}

/**
 * Fire-and-forget hook. In production, replace with Cloud Tasks / BullMQ for durability.
 * On Vercel the function is frozen once the response is sent, so the promise is handed to
 * `waitUntil` to keep it alive. The cron sweeper (/api/internal/sweep) retries anything that
 * still slips through (e.g. grading longer than the function's maxDuration).
 */
export function queueGrading(submissionId: string, opts?: { force?: boolean }) {
  const job = () =>
    gradeSubmission(submissionId, opts).catch((err) =>
      logger.error('queueGrading crashed', { submissionId, err: (err as Error).message }),
    );

  if (process.env.VERCEL) {
    waitUntil(job());
  } else {
    setImmediate(job);
  }
}
