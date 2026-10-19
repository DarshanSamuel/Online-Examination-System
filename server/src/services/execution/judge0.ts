import { logger } from '../../lib/logger.js';
import { chunk, sleep } from '../../lib/util.js';
import { LANGUAGES } from './languages.js';
import { internalError, type CodeRunner, type ExecutionRequest, type ExecutionResult, type ExecutionStatus } from './types.js';

interface Judge0Options {
  baseUrl: string;
  headers: Record<string, string>;
  /** Judge0's default batch cap is 20. */
  maxBatchSize?: number;
  pollIntervalMs?: number;
  overallTimeoutMs?: number;
}

interface Judge0Submission {
  token: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  exit_code: number | null;
  time: string | null;
  memory: number | null;
  status: { id: number; description: string };
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | null | undefined) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');

/**
 * Judge0 status ids:
 *  1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer, 5 TLE, 6 Compilation Error,
 *  7–12 Runtime errors (SIGSEGV, SIGXFSZ, SIGFPE, SIGABRT, NZEC, Other),
 *  13 Internal Error, 14 Exec Format Error.
 * We never send `expected_output`, so 3 simply means "ran to completion";
 * comparison happens on our side with configurable normalization.
 */
function mapStatus(id: number): ExecutionStatus {
  if (id === 3 || id === 4) return 'ok';
  if (id === 5) return 'time_limit';
  if (id === 6) return 'compile_error';
  if (id >= 7 && id <= 12) return 'runtime_error';
  return 'internal_error';
}

export class Judge0Runner implements CodeRunner {
  readonly name = 'judge0';
  private readonly maxBatch: number;
  private readonly pollMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: Judge0Options) {
    this.maxBatch = opts.maxBatchSize ?? 20;
    this.pollMs = opts.pollIntervalMs ?? 600;
    this.timeoutMs = opts.overallTimeoutMs ?? 45_000;
  }

  async runBatch(requests: ExecutionRequest[]): Promise<ExecutionResult[]> {
    const out: ExecutionResult[] = [];
    for (const part of chunk(requests, this.maxBatch)) out.push(...(await this.runChunk(part)));
    return out;
  }

  private async runChunk(requests: ExecutionRequest[]): Promise<ExecutionResult[]> {
    const created = await this.http<Array<{ token?: string } & Record<string, unknown>>>(
      'POST',
      '/submissions/batch?base64_encoded=true',
      {
        submissions: requests.map((r) => ({
          language_id: LANGUAGES[r.language].judge0Id,
          source_code: b64(r.sourceCode),
          stdin: b64(r.stdin),
          cpu_time_limit: r.cpuTimeLimitSec,
          wall_time_limit: Math.min(r.cpuTimeLimitSec * 3, 20),
          memory_limit: r.memoryLimitKb,
          enable_network: false,
        })),
      },
    );

    const results: (ExecutionResult | null)[] = created.map((c) =>
      c.token ? null : internalError(`Judge0 rejected submission: ${JSON.stringify(c)}`),
    );
    const pending = new Map<string, number>(); // token -> index
    created.forEach((c, i) => c.token && pending.set(c.token, i));

    const deadline = Date.now() + this.timeoutMs;
    let delay = this.pollMs;

    while (pending.size > 0) {
      if (Date.now() > deadline) {
        for (const i of pending.values()) results[i] = internalError('Execution timed out waiting for Judge0');
        logger.warn('Judge0 poll timeout', { pending: pending.size });
        break;
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 3_000); // gentle backoff under load

      const tokens = [...pending.keys()].join(',');
      const fields = 'token,stdout,stderr,compile_output,message,exit_code,time,memory,status';
      const { submissions } = await this.http<{ submissions: Judge0Submission[] }>(
        'GET',
        `/submissions/batch?tokens=${tokens}&base64_encoded=true&fields=${fields}`,
      );

      for (const s of submissions) {
        if (!s || s.status.id <= 2) continue; // queued / processing
        const idx = pending.get(s.token);
        if (idx === undefined) continue;
        pending.delete(s.token);
        results[idx] = {
          status: mapStatus(s.status.id),
          stdout: unb64(s.stdout),
          stderr: unb64(s.stderr) || unb64(s.message),
          compileOutput: unb64(s.compile_output),
          timeSec: s.time !== null ? Number(s.time) : null,
          memoryKb: s.memory,
          exitCode: s.exit_code,
          providerStatus: s.status.description,
        };
      }
    }

    return results.map((r) => r ?? internalError('Missing Judge0 result'));
  }

  private async http<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...this.opts.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Judge0 ${method} ${path.split('?')[0]} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }
}
