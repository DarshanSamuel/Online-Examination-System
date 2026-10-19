import { round2 } from '../../lib/util.js';
import type { CodingQuestion, LanguageKey, QuestionGrade, TestCase } from '../../types/schema.js';
import type { CodeRunner, ExecutionResult } from '../execution/index.js';
import { outputsMatch } from './compare.js';

export interface GradableTestCase extends TestCase {
  visibility: 'public' | 'hidden';
}

export interface TestRunResult {
  testCase: GradableTestCase;
  execution: ExecutionResult;
  passed: boolean;
}

export interface TestSuiteOutcome {
  results: TestRunResult[];
  passedWeight: number;
  totalWeight: number;
}

const weightOf = (tc: TestCase) => (tc.weight > 0 ? tc.weight : 1);

/** Executes `code` against every test case in a single sandbox batch and compares stdout. */
export async function runTestSuite(
  runner: CodeRunner,
  question: Pick<CodingQuestion, 'limits' | 'comparison' | 'floatTolerance'>,
  language: LanguageKey,
  code: string,
  cases: GradableTestCase[],
): Promise<TestSuiteOutcome> {
  if (cases.length === 0) return { results: [], passedWeight: 0, totalWeight: 0 };

  const executions = await runner.runBatch(
    cases.map((tc) => ({
      language,
      sourceCode: code,
      stdin: tc.input,
      cpuTimeLimitSec: question.limits.cpuTimeSec,
      memoryLimitKb: question.limits.memoryKb,
    })),
  );

  let passedWeight = 0;
  let totalWeight = 0;
  const results = cases.map((tc, i) => {
    const execution = executions[i]!;
    const passed = execution.status === 'ok' && outputsMatch(execution.stdout, tc.expectedOutput, question.comparison, question.floatTolerance);
    totalWeight += weightOf(tc);
    if (passed) passedWeight += weightOf(tc);
    return { testCase: tc, execution, passed };
  });

  return { results, passedWeight, totalWeight };
}

/** Weighted partial credit across public + hidden tests. Hidden I/O is never stored in the grade. */
export async function gradeCoding(
  runner: CodeRunner,
  question: CodingQuestion,
  hiddenTestCases: TestCase[],
  language: LanguageKey,
  code: string,
  points: number,
): Promise<QuestionGrade> {
  if (code.trim() === '') return { score: 0, maxScore: points, status: 'unanswered' };

  const cases: GradableTestCase[] = [
    ...question.publicTestCases.map((t) => ({ ...t, visibility: 'public' as const })),
    ...hiddenTestCases.map((t) => ({ ...t, visibility: 'hidden' as const })),
  ];
  const outcome = await runTestSuite(runner, question, language, code, cases);

  if (outcome.results.some((r) => r.execution.status === 'internal_error')) {
    // Infrastructure failure, not the candidate's fault — surface for retry instead of scoring 0.
    throw new Error(`Sandbox internal error while grading question`);
  }

  const score = outcome.totalWeight ? round2((points * outcome.passedWeight) / outcome.totalWeight) : 0;
  return {
    score,
    maxScore: points,
    status: score === points ? 'correct' : score === 0 ? 'incorrect' : 'partial',
    note: outcome.results[0]?.execution.status === 'compile_error' ? 'Compilation error' : undefined,
    tests: outcome.results.map((r) => ({
      testCaseId: r.testCase.id,
      visibility: r.testCase.visibility,
      passed: r.passed,
      status: r.passed ? 'passed' : r.execution.status === 'ok' ? 'wrong_answer' : r.execution.status,
      timeSec: r.execution.timeSec,
      memoryKb: r.execution.memoryKb,
    })),
  };
}
