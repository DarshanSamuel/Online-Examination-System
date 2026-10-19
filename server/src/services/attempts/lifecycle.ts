import { Timestamp, type Transaction } from 'firebase-admin/firestore';
import { assignmentId, collections, db, submissionId as makeSubmissionId } from '../../config/firebase.js';
import { HttpError, isHttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sample, shuffle } from '../../lib/util.js';
import type { AuthedUser } from '../../middleware/auth.js';
import type { AssignmentDoc, AttemptHistoryEntry, ExamDoc, QuestionDoc, QuestionMapEntry, SubmissionDoc, SubmitReason } from '../../types/schema.js';
import { queueGrading } from '../grading/gradeSubmission.js';

/* ───────────────────────────── helpers ───────────────────────────── */

export async function loadOwnedSubmission(id: string, uid: string, tx?: Transaction) {
  const ref = collections.submissions.doc(id);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const sub = snap.data() as SubmissionDoc | undefined;
  // Same 404 for "missing" and "not yours" to avoid leaking attempt ids.
  if (!sub || sub.candidateUid !== uid) throw new HttpError(404, 'Attempt not found', 'ATTEMPT_NOT_FOUND');
  return { ref, sub };
}

/** The single gate for every candidate write. Uses server time only. */
export function assertActive(sub: SubmissionDoc, nowMs = Date.now()) {
  if (sub.status !== 'in_progress') throw new HttpError(409, 'Attempt already submitted', 'ATTEMPT_CLOSED');
  const hardStop = sub.timing.deadlineAt.toMillis() + sub.examSnapshot.gracePeriodSec * 1000;
  if (nowMs > hardStop) throw new HttpError(409, 'Time is up', 'ATTEMPT_EXPIRED');
}

/** If a write bounced because time ran out, make sure the attempt actually gets closed. */
export function finalizeIfExpired(err: unknown, id: string) {
  if (isHttpError(err, 'ATTEMPT_EXPIRED')) {
    finalizeAttempt(id, 'timeout').catch((e) => logger.error('auto-finalize failed', { id, err: (e as Error).message }));
  }
}

/* ───────────────────────────── start ───────────────────────────── */

export interface StartResult {
  submissionId: string;
  resumed: boolean;
  startedAt: number;
  deadlineAt: number;
  serverNow: number;
}

function toMillis(v: unknown): number {
  if (v && typeof v === 'object') {
    if (typeof (v as { toMillis?: unknown }).toMillis === 'function') {
      return (v as Timestamp).toMillis();
    }
    const sec = (v as { seconds?: number; _seconds?: number }).seconds ?? (v as { _seconds?: number })._seconds;
    const nano = (v as { nanoseconds?: number; _nanoseconds?: number }).nanoseconds ?? (v as { _nanoseconds?: number })._nanoseconds ?? 0;
    if (typeof sec === 'number') return sec * 1000 + Math.floor(nano / 1_000_000);
  }
  return Date.now();
}

export async function startAttempt(user: AuthedUser, examId: string, client: { userAgent: string; ip: string | null }): Promise<StartResult> {
  const examRef = collections.exams.doc(examId);
  const asgRef = collections.assignments.doc(assignmentId(examId, user.email));
  const id = makeSubmissionId(examId, user.uid);
  const subRef = collections.submissions.doc(id);

  return db.runTransaction(async (tx) => {
    const [examSnap, asgSnap, subSnap] = await tx.getAll(examRef, asgRef, subRef);
    const exam = examSnap.data() as ExamDoc | undefined;
    if (!exam || exam.status !== 'published') throw new HttpError(404, 'Exam not found', 'EXAM_NOT_FOUND');

    const nowMs = Date.now();
    const opensMs = toMillis(exam.window.opensAt);
    const closesMs = toMillis(exam.window.closesAt);

    let attemptCount = 1;
    let attemptHistory: AttemptHistoryEntry[] = [];

    if (subSnap.exists) {
      const sub = subSnap.data() as SubmissionDoc;
      const hardStop = sub.timing.deadlineAt.toMillis() + sub.examSnapshot.gracePeriodSec * 1000;
      // Resume an active in-progress attempt (page refresh / device switch) — never resets the clock.
      if (sub.status === 'in_progress' && nowMs <= hardStop) {
        return { submissionId: id, resumed: true, startedAt: sub.timing.startedAt.toMillis(), deadlineAt: sub.timing.deadlineAt.toMillis(), serverNow: nowMs };
      }

      // Otherwise the candidate is starting a reattempt — verify window and attempt allowance.
      if (nowMs < opensMs) throw new HttpError(403, 'Exam has not opened yet', 'EXAM_NOT_OPEN');
      if (nowMs >= closesMs) throw new HttpError(403, 'Exam window has closed', 'EXAM_CLOSED');

      const prevAttempts = sub.attemptCount ?? (asgSnap.exists ? (asgSnap.data() as AssignmentDoc).attemptCount : undefined) ?? 1;
      const maxAttempts = exam.settings.maxAttempts ?? 0; // 0 = unlimited until closing time
      if (maxAttempts > 0 && prevAttempts >= maxAttempts) {
        throw new HttpError(403, `No attempts remaining (${prevAttempts}/${maxAttempts} used)`, 'MAX_ATTEMPTS_REACHED');
      }

      // Snapshot the completed previous attempt into attemptHistory before resetting for the new attempt.
      const prevEntry: AttemptHistoryEntry = {
        attemptNumber: prevAttempts,
        status: sub.status === 'in_progress' ? 'submitted' : sub.status,
        submitReason: sub.submitReason ?? 'timeout',
        startedAt: sub.timing.startedAt,
        submittedAt: sub.timing.submittedAt ?? Timestamp.fromMillis(nowMs),
        totalScore: sub.grading.totalScore,
        maxScore: sub.grading.maxScore ?? sub.questionMap.reduce((acc, q) => acc + q.points, 0),
        warningCount: sub.proctoring.warningCount,
        perQuestion: sub.grading.perQuestion,
      };
      const existingHistory = (sub.attemptHistory ?? []).filter((h) => h.attemptNumber !== prevAttempts);
      attemptHistory = [...existingHistory, prevEntry].sort((a, b) => a.attemptNumber - b.attemptNumber);
      attemptCount = prevAttempts + 1;
    } else {
      if (nowMs < opensMs) throw new HttpError(403, 'Exam has not opened yet', 'EXAM_NOT_OPEN');
      if (nowMs >= closesMs) throw new HttpError(403, 'Exam window has closed', 'EXAM_CLOSED');
    }

    const deadlineMs = Math.min(nowMs + exam.durationMinutes * 60_000, closesMs);
    const questionMap = await buildQuestionMap(tx, exam);
    const startedAt = Timestamp.fromMillis(nowMs);

    const doc: SubmissionDoc = {
      examId,
      candidateUid: user.uid,
      candidateEmail: user.email,
      candidateName: user.name,
      status: 'in_progress',
      submitReason: null,
      attemptCount,
      attemptHistory,
      examSnapshot: {
        title: exam.title,
        allowedLanguages: exam.settings.allowedLanguages,
        maxWarnings: exam.settings.maxWarnings,
        gracePeriodSec: exam.settings.gracePeriodSec,
      },
      timing: { startedAt, deadlineAt: Timestamp.fromMillis(deadlineMs), submittedAt: null },
      questionMap,
      answers: {},
      sync: { lastServerSyncAt: null, lastClientSavedAt: null, syncCount: 0 },
      proctoring: {
        warningCount: 0,
        tabSwitches: 0,
        fullscreenExits: 0,
        clipboardAttempts: 0,
        blockedShortcuts: 0,
        audioFlags: 0,
        snapshotCount: 0,
        lastViolationAt: null,
        lastHeartbeatAt: startedAt,
      },
      keystrokeStats: {},
      grading: { attempts: 0, startedAt: null, gradedAt: null, lastError: null, totalScore: null, maxScore: null, perQuestion: {} },
      client,
    };

    tx.set(subRef, doc);
    if (asgSnap.exists) {
      tx.update(asgRef, { status: 'started', candidateUid: user.uid, startedAt, attemptCount } satisfies Partial<AssignmentDoc>);
    } else {
      tx.set(asgRef, {
        examId,
        examTitle: exam.title,
        candidateEmail: user.email.toLowerCase(),
        candidateUid: user.uid,
        assignedBy: exam.createdBy,
        assignedAt: startedAt,
        startedAt,
        status: 'started',
        attemptCount,
      } satisfies AssignmentDoc);
    }
    return { submissionId: id, resumed: false, startedAt: nowMs, deadlineAt: deadlineMs, serverNow: nowMs };
  });
}

/**
 * Draws `drawCount` questions per section with a CSPRNG and shuffles MCQ options.
 * The result is frozen into the submission, so a refresh can't re-roll questions.
 */
async function buildQuestionMap(tx: Transaction, exam: ExamDoc): Promise<QuestionMapEntry[]> {
  const drawn: { sectionId: string; questionId: string; pointsOverride: number | null }[] = [];

  for (const section of exam.sections) {
    const picked = sample(section.poolQuestionIds, section.drawCount);
    const pickedSet = new Set(picked);
    const ordered = section.shuffleQuestions ? picked : section.poolQuestionIds.filter((qid) => pickedSet.has(qid));
    for (const questionId of ordered) drawn.push({ sectionId: section.id, questionId, pointsOverride: section.pointsPerQuestion });
  }
  if (drawn.length === 0) throw new HttpError(500, 'Exam has no questions', 'EXAM_EMPTY');

  const snaps = await tx.getAll(...drawn.map((d) => collections.questions.doc(d.questionId)));

  return drawn.map((d, order) => {
    const q = snaps[order]!.data() as QuestionDoc | undefined;
    if (!q) throw new HttpError(500, `Question ${d.questionId} is missing`, 'QUESTION_MISSING');
    const optionIds = q.type === 'mcq' ? q.options.map((o) => o.id) : null;
    return {
      questionId: d.questionId,
      sectionId: d.sectionId,
      type: q.type,
      points: d.pointsOverride ?? q.points,
      order,
      optionOrder: optionIds && exam.settings.shuffleOptions ? shuffle(optionIds) : optionIds,
      questionVersion: q.version,
    };
  });
}

/* ───────────────────────────── finalize ───────────────────────────── */

/**
 * Locks the attempt (no more answer writes) and queues grading.
 * Idempotent: manual submit, timer expiry, warning limit and the sweeper can all race safely.
 */
export async function finalizeAttempt(id: string, reason: SubmitReason): Promise<{ alreadyFinalized: boolean }> {
  const ref = collections.submissions.doc(id);

  const changed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const sub = snap.data() as SubmissionDoc | undefined;
    if (!sub) throw new HttpError(404, 'Attempt not found', 'ATTEMPT_NOT_FOUND');
    if (sub.status !== 'in_progress') return false;

    const now = Timestamp.now();
    tx.update(ref, { status: 'submitted', submitReason: reason, 'timing.submittedAt': now });
    tx.set(
      collections.assignments.doc(assignmentId(sub.examId, sub.candidateEmail)),
      { status: 'submitted', submittedAt: now, attemptCount: sub.attemptCount ?? 1 },
      { merge: true },
    );
    return true;
  });

  if (changed) {
    logger.info('Attempt finalized', { id, reason });
    queueGrading(id);
  }
  return { alreadyFinalized: !changed };
}
