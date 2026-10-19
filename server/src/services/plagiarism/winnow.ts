/** 32-bit FNV-1a. Collisions are statistically irrelevant at exam scale. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function kgramHashes(tokens: string[], k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + k <= tokens.length; i++) out.push(fnv1a(tokens.slice(i, i + k).join('\u0001')));
  return out;
}

/**
 * Winnowing (Schleimer, Wilkerson & Aiken, SIGMOD 2003 — the algorithm behind MOSS).
 * From every window of `w` consecutive k-gram hashes keep the minimum (rightmost on ties).
 * Guarantees: any shared run of ≥ w + k − 1 tokens is detected; noise below k tokens is ignored.
 */
export function winnow(hashes: number[], w: number): Set<number> {
  const fp = new Set<number>();
  if (hashes.length === 0) return fp;
  if (hashes.length < w) {
    fp.add(Math.min(...hashes));
    return fp;
  }
  let lastPicked = -1;
  for (let start = 0; start + w <= hashes.length; start++) {
    let minIdx = start;
    for (let j = start + 1; j < start + w; j++) if (hashes[j]! <= hashes[minIdx]!) minIdx = j;
    if (minIdx !== lastPicked) {
      fp.add(hashes[minIdx]!);
      lastPicked = minIdx;
    }
  }
  return fp;
}
