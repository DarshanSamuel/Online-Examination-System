import { collections, db, submissionId as makeSubmissionId } from '../../config/firebase.js';
import type { AuthedUser } from '../../middleware/auth.js';
import type { ExamDoc, LanguageKey, QuestionDoc, QuestionMapEntry, SubmissionDoc } from '../../types/schema.js';
import { LANGUAGES } from '../execution/languages.js';
import { loadOwnedSubmission } from './lifecycle.js';

/**
 * Builds the candidate-safe exam payload.
 * Never includes: answer keys, hidden tests, other candidates' data, unshuffled option order.
 */
export async function getAttemptView(user: AuthedUser, submissionId: string) {
  const { sub } = await loadOwnedSubmission(submissionId, user.uid);
  const serverNow = Date.now();
  const exam = (await collections.exams.doc(sub.examId).get()).data() as ExamDoc | undefined;
  const s = exam?.settings;

  const base = {
    submissionId,
    examId: sub.examId,
    examTitle: sub.examSnapshot.title,
    instructions: exam?.instructions ?? '',
    status: sub.status,
    submitReason: sub.submitReason,
    startedAt: sub.timing.startedAt.toMillis(),
    deadlineAt: sub.timing.deadlineAt.toMillis(),
    serverNow,
    maxWarnings: sub.examSnapshot.maxWarnings,
    warningCount: sub.proctoring.warningCount,
    proctoring: {
      requireFullscreen: s?.requireFullscreen ?? true,
      requireWebcam: s?.requireWebcam ?? true,
      requireMicrophone: s?.requireMicrophone ?? true,
      snapshotIntervalSec: s?.snapshotIntervalSec ?? 60,
      audioThresholdDb: s?.audioThresholdDb ?? -20,
    },
  };
  if (sub.status !== 'in_progress') return { ...base, questions: [], answers: {} };

  const snaps = await db.getAll(...sub.questionMap.map((e) => collections.questions.doc(e.questionId)));
  const questions = sub.questionMap.map((entry, i) => toCandidateQuestion(entry, snaps[i]!.data() as QuestionDoc, sub.examSnapshot.allowedLanguages));

  return { ...base, questions, answers: candidateAnswers(sub) };
}

function toCandidateQuestion(entry: QuestionMapEntry, q: QuestionDoc, allowed: LanguageKey[]) {
  const common = {
    questionId: entry.questionId,
    sectionId: entry.sectionId,
    order: entry.order,
    type: q.type,
    title: q.title,
    prompt: q.prompt,
    points: entry.points,
  };

  switch (q.type) {
    case 'mcq': {
      const byId = new Map(q.options.map((o) => [o.id, o]));
      const options = (entry.optionOrder ?? []).flatMap((id) => {
        const o = byId.get(id);
        return o ? [{ id: o.id, text: o.text }] : [];
      });
      return { ...common, type: 'mcq' as const, options };
    }
    case 'numerical':
      return { ...common, type: 'numerical' as const, unit: q.unit };
    case 'coding':
      return {
        ...common,
        type: 'coding' as const,
        languages: allowed.map((key) => ({ key, label: LANGUAGES[key].label, monaco: LANGUAGES[key].monaco, starterCode: q.starterCode[key] ?? '' })),
        publicTestCases: q.publicTestCases.map(({ id, input, expectedOutput, explanation }) => ({ id, input, expectedOutput, explanation })),
        limits: q.limits,
      };
  }
}

/** Saved answers for cross-device resume (Firestore timestamps → epoch ms). */
function candidateAnswers(sub: SubmissionDoc) {
  return Object.fromEntries(
    Object.entries(sub.answers).map(([qid, a]) => {
      const { serverSyncedAt, ...rest } = a;
      return [qid, { ...rest, serverSyncedAt: serverSyncedAt.toMillis() }];
    }),
  );
}

/**
 * Candidate-visible outcome. Scores are only revealed when the examiner enabled
 * `showResultsToCandidate`; hidden test details are never included.
 */
export async function getAttemptResult(user: AuthedUser, examId: string) {
  const id = makeSubmissionId(examId, user.uid);
  const { sub } = await loadOwnedSubmission(id, user.uid);
  const exam = (await collections.exams.doc(examId).get()).data() as ExamDoc | undefined;
  const base = { submissionId: id, examTitle: sub.examSnapshot.title, status: sub.status, submitReason: sub.submitReason, submittedAt: sub.timing.submittedAt?.toMillis() ?? null };

  if (sub.status !== 'graded' || !exam?.settings.showResultsToCandidate) return { ...base, released: false as const };

  const g = sub.grading;
  return {
    ...base,
    released: true as const,
    totalScore: g.totalScore,
    maxScore: g.maxScore,
    questions: sub.questionMap
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((e) => ({ questionId: e.questionId, type: e.type, score: g.perQuestion[e.questionId]?.score ?? 0, maxScore: g.perQuestion[e.questionId]?.maxScore ?? e.points, status: g.perQuestion[e.questionId]?.status ?? 'unanswered' })),
  };
}
