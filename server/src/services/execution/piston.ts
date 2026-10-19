import { mapLimit } from '../../lib/util.js';
import { LANGUAGES } from './languages.js';
import { internalError, type CodeRunner, type ExecutionRequest, type ExecutionResult } from './types.js';

interface PistonStage {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
}

interface PistonResponse {
  run?: PistonStage;
  compile?: PistonStage;
  message?: string;
}

/**
 * Piston adapter (self-hosted: https://github.com/engineer-man/piston).
 * Piston has no batch endpoint, so requests fan out with bounded concurrency.
 */
export class PistonRunner implements CodeRunner {
  readonly name = 'piston';

  constructor(
    private readonly baseUrl: string,
    private readonly concurrency = 4,
  ) {}

  runBatch(requests: ExecutionRequest[]): Promise<ExecutionResult[]> {
    return mapLimit(requests, this.concurrency, (r) => this.runOne(r));
  }

  private async runOne(r: ExecutionRequest): Promise<ExecutionResult> {
    const lang = LANGUAGES[r.language].piston;
    let data: PistonResponse;
    try {
      const res = await fetch(`${this.baseUrl}/api/v2/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: lang.language,
          version: lang.version,
          files: [{ name: lang.fileName, content: r.sourceCode }],
          stdin: r.stdin,
          compile_timeout: 10_000,
          run_timeout: Math.round(r.cpuTimeLimitSec * 1000),
          run_memory_limit: r.memoryLimitKb * 1024,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      data = (await res.json()) as PistonResponse;
      if (!res.ok) return internalError(data.message ?? `Piston HTTP ${res.status}`);
    } catch (e) {
      return internalError(`Piston unreachable: ${(e as Error).message}`);
    }

    const base = { timeSec: null, memoryKb: null } as const;
    const compile = data.compile;
    if (compile && compile.code !== 0) {
      return { ...base, status: 'compile_error', stdout: '', stderr: '', compileOutput: compile.stderr || compile.stdout, exitCode: compile.code, providerStatus: 'Compilation Error' };
    }
    const run = data.run;
    if (!run) return internalError(data.message ?? 'Piston returned no run stage');

    // Piston kills timed-out processes with SIGKILL.
    const status = run.signal === 'SIGKILL' ? 'time_limit' : run.code !== 0 ? 'runtime_error' : 'ok';
    return { ...base, status, stdout: run.stdout, stderr: run.stderr, compileOutput: '', exitCode: run.code, providerStatus: run.signal ?? `exit ${run.code}` };
  }
}
