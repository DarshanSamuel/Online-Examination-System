process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.ENABLE_SWEEPER = 'false';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tokenize } from '../src/services/plagiarism/tokenize.js';
import { kgramHashes, winnow } from '../src/services/plagiarism/winnow.js';

// Dynamic import so env vars above are set before config/env.ts evaluates.
const { compareSamples } = await import('../src/services/plagiarism/similarity.js');

const original = `
def two_sum(nums, target):
    # classic hash map approach
    seen = {}
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return seen[need], i
        seen[x] = i
    return -1, -1

n = int(input())
arr = list(map(int, input().split()))
t = int(input())
a, b = two_sum(arr, t)
print(a, b)
`;

// Renamed identifiers, changed comments/strings/whitespace — same structure.
const disguised = `
def find_pair(values, goal):
    lookup = {}          # store indices
    for idx, v in enumerate(values):
        rem = goal - v
        if rem in lookup:
            return lookup[rem], idx
        lookup[v] = idx
    return -1, -1

count = int(input())
data = list(map(int, input().split()))
g = int(input())
p, q = find_pair(data, g)
print(p, q)
`;

const different = `
import sys
def main():
    data = sys.stdin.read().split()
    n = int(data[0]); arr = [int(x) for x in data[1:n+1]]; t = int(data[n+1])
    order = sorted(range(n), key=lambda k: arr[k])
    lo, hi = 0, n - 1
    while lo < hi:
        s = arr[order[lo]] + arr[order[hi]]
        if s == t:
            print(*sorted((order[lo], order[hi]))); return
        if s < t: lo += 1
        else: hi -= 1
main()
`;

describe('tokenize', () => {
  it('erases identifiers, literals and comments', () => {
    assert.deepEqual(tokenize('x = foo(1, "a") # hi', 'python'), ['V', '=', 'V', '(', 'N', ',', 'S', ')']);
    assert.deepEqual(tokenize('int a = 5; // c\n/* b */ s = "//x";', 'cpp'), ['int', 'V', '=', 'N', ';', 'V', '=', 'S', ';']);
  });
});

describe('winnow', () => {
  it('is deterministic and selects a subset of hashes', () => {
    const h = kgramHashes(tokenize(original, 'python'), 6);
    const fp = winnow(h, 5);
    assert.ok(fp.size > 0 && fp.size <= h.length);
    assert.deepEqual([...winnow(h, 5)], [...fp]);
  });
});

describe('compareSamples', () => {
  const samples = [
    { submissionId: 's1', candidate: 'a@x', language: 'python' as const, code: original },
    { submissionId: 's2', candidate: 'b@x', language: 'python' as const, code: disguised },
    { submissionId: 's3', candidate: 'c@x', language: 'python' as const, code: different },
  ];

  it('flags renamed copies and ignores independent solutions', () => {
    const pairs = compareSamples(samples, {}, 0.6);
    assert.equal(pairs.length, 1);
    assert.deepEqual([pairs[0]!.submissionA, pairs[0]!.submissionB].sort(), ['s1', 's2']);
    assert.ok(pairs[0]!.containment >= 0.9, `containment=${pairs[0]!.containment}`);
  });

  it('does not compare across languages', () => {
    const pairs = compareSamples([samples[0]!, { ...samples[1]!, language: 'javascript' }], {}, 0.1);
    assert.equal(pairs.length, 0);
  });

  it('starter code alone does not create a match', () => {
    const starter = original;
    const pairs = compareSamples(samples.slice(0, 2).map((s) => ({ ...s, code: original })), { python: starter }, 0.6);
    assert.equal(pairs.length, 0);
  });
});
