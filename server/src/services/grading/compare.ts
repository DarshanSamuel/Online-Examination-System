import type { ComparisonMode } from '../../types/schema.js';

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, '\n');

/** Strip trailing spaces on each line and trailing blank lines. */
const trimLines = (s: string) =>
  normalizeNewlines(s)
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

const NUMERIC = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

function floatEq(a: string, b: string, tol: number): boolean {
  if (a === b) return true;
  if (!NUMERIC.test(a) || !NUMERIC.test(b)) return false;
  const x = Number(a);
  const y = Number(b);
  return Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
}

/**
 * Compares program output with the expected output.
 *  exact   – byte-for-byte (after CRLF→LF)
 *  trimmed – ignores trailing whitespace per line and trailing newlines (default)
 *  tokens  – ignores all whitespace differences
 *  float   – tokens, numeric tokens compared with relative tolerance
 */
export function outputsMatch(actual: string, expected: string, mode: ComparisonMode = 'trimmed', floatTolerance = 1e-6): boolean {
  switch (mode) {
    case 'exact':
      return normalizeNewlines(actual) === normalizeNewlines(expected);
    case 'trimmed':
      return trimLines(actual) === trimLines(expected);
    case 'tokens': {
      const a = tokens(actual);
      const b = tokens(expected);
      return a.length === b.length && a.every((t, i) => t === b[i]);
    }
    case 'float': {
      const a = tokens(actual);
      const b = tokens(expected);
      return a.length === b.length && a.every((t, i) => floatEq(t, b[i]!, floatTolerance));
    }
  }
}

/** Strict numeric parse: rejects "", "0x10", "1,000", "Infinity", "NaN". */
export function parseStrictNumber(raw: string): number | null {
  const s = raw.trim();
  if (!NUMERIC.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
