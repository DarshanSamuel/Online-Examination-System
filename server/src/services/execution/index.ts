import { env } from '../../config/env.js';
import { Judge0Runner } from './judge0.js';
import { PistonRunner } from './piston.js';
import type { CodeRunner } from './types.js';

function createRunner(): CodeRunner {
  if (env.EXECUTION_PROVIDER === 'piston') return new PistonRunner(env.PISTON_URL);

  const headers: Record<string, string> = {};
  if (env.JUDGE0_RAPIDAPI_KEY) {
    headers['X-RapidAPI-Key'] = env.JUDGE0_RAPIDAPI_KEY;
    headers['X-RapidAPI-Host'] = env.JUDGE0_RAPIDAPI_HOST ?? new URL(env.JUDGE0_URL).host;
  }
  if (env.JUDGE0_AUTH_HEADER && env.JUDGE0_AUTH_TOKEN) {
    headers[env.JUDGE0_AUTH_HEADER] = env.JUDGE0_AUTH_TOKEN;
  }
  return new Judge0Runner({ baseUrl: env.JUDGE0_URL.replace(/\/$/, ''), headers });
}

export const runner: CodeRunner = createRunner();
export * from './types.js';
export { LANGUAGES } from './languages.js';
