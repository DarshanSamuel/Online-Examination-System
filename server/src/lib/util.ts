import { createHash, randomInt } from 'node:crypto';

/** Fisher–Yates using a CSPRNG so draws can't be predicted from earlier attempts. */
export function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function sample<T>(input: readonly T[], n: number): T[] {
  return shuffle(input).slice(0, Math.max(0, Math.min(n, input.length)));
}

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n…[truncated]` : s);

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Map with bounded concurrency, preserving input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
