import type { LanguageKey } from '../../types/schema.js';

export interface ExecutionRequest {
  language: LanguageKey;
  sourceCode: string;
  stdin: string;
  cpuTimeLimitSec: number;
  memoryLimitKb: number;
}

export type ExecutionStatus =
  | 'ok'
  | 'compile_error'
  | 'runtime_error'
  | 'time_limit'
  | 'memory_limit'
  | 'internal_error';

export interface ExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  timeSec: number | null;
  memoryKb: number | null;
  exitCode: number | null;
  /** Provider-specific status text, for debugging/examiner view. */
  providerStatus: string;
}

/** Any sandbox (Judge0, Piston, a custom Firecracker pool…) implements this. */
export interface CodeRunner {
  readonly name: string;
  /** Results MUST be returned in the same order as `requests`. */
  runBatch(requests: ExecutionRequest[]): Promise<ExecutionResult[]>;
}

export const internalError = (message: string): ExecutionResult => ({
  status: 'internal_error',
  stdout: '',
  stderr: message,
  compileOutput: '',
  timeSec: null,
  memoryKb: null,
  exitCode: null,
  providerStatus: 'internal_error',
});
