import { Timestamp } from 'firebase-admin/firestore';
import { collections } from '../../config/firebase.js';
import { HttpError } from '../../lib/errors.js';
import { sha256, truncate } from '../../lib/util.js';
import type { AuthedUser } from '../../middleware/auth.js';
import type { CodeRunDoc, QuestionDoc } from '../../types/schema.js';
import type { z } from 'zod';
import type { runBodySchema } from '../../validation/schemas.js';
import { runner } from '../execution/index.js';
import { runTestSuite } from '../grading/code.js';
import { assertActive, loadOwnedSubmission } from './lifecycle.js';

type RunInput = z.infer<typeof runBodySchema>;
const OUT_MAX = 8 * 1024;

/**
 * "Run code" button: executes against PUBLIC tests only (or custom stdin).
 * Hidden tests are only ever touched by the grader after final submission.
 */
export async function runCandidateCode(user: AuthedUser, submissionId: string, input: RunInput) {
  const { ref, sub } = await loadOwnedSubmission(submissionId, user.uid);
  assertActive(sub);

  const entry = sub.questionMap.find((e) => e.questionId === input.questionId);
  if (!entry || entry.type !== 'coding') throw new HttpError(400, 'Not a coding question in this attempt', 'BAD_QUESTION');
  if (!sub.examSnapshot.allowedLanguages.includes(input.language)) throw new HttpError(400, 'Language not allowed', 'LANGUAGE_NOT_ALLOWED');

  const question = (await collections.questions.doc(input.questionId).get()).data() as QuestionDoc | undefined;
  if (!question || question.type !== 'coding') throw new HttpError(500, 'Question unavailable', 'QUESTION_MISSING');

  const log = (mode: CodeRunDoc['mode'], passed: number, total: number) =>
    ref.collection('runs').add({ questionId: input.questionId, language: input.language, codeSha256: sha256(input.code), mode, passed, total, serverTs: Timestamp.now() } satisfies CodeRunDoc);

  if (input.customInput !== undefined) {
    const [r] = await runner.runBatch([
      { language: input.language, sourceCode: input.code, stdin: input.customInput, cpuTimeLimitSec: question.limits.cpuTimeSec, memoryLimitKb: question.limits.memoryKb },
    ]);
    await log('custom', 0, 0);
    return {
      mode: 'custom' as const,
      result: { status: r!.status, stdout: truncate(r!.stdout, OUT_MAX), stderr: truncate(r!.stderr, OUT_MAX), compileOutput: truncate(r!.compileOutput, OUT_MAX), timeSec: r!.timeSec, memoryKb: r!.memoryKb },
    };
  }

  const outcome = await runTestSuite(
    runner,
    question,
    input.language,
    input.code,
    question.publicTestCases.map((t) => ({ ...t, visibility: 'public' as const })),
  );
  const passed = outcome.results.filter((r) => r.passed).length;
  await log('tests', passed, outcome.results.length);

  return {
    mode: 'tests' as const,
    passed,
    total: outcome.results.length,
    results: outcome.results.map(({ testCase, execution, passed }) => ({
      testCaseId: testCase.id,
      passed,
      status: passed ? 'passed' : execution.status === 'ok' ? 'wrong_answer' : execution.status,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      stdout: truncate(execution.stdout, OUT_MAX),
      stderr: truncate(execution.stderr, OUT_MAX),
      compileOutput: truncate(execution.compileOutput, OUT_MAX),
      timeSec: execution.timeSec,
      memoryKb: execution.memoryKb,
    })),
  };
}
