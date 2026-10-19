import { Timestamp } from 'firebase-admin/firestore';
import { collections } from '../../config/firebase.js';
import { round2 } from '../../lib/util.js';
import type { CodingQuestion, LanguageKey, QuestionDoc, SimilarityPair, SimilarityReportDoc, SubmissionDoc } from '../../types/schema.js';
import { assertExamOwner } from '../exams.js';
import { tokenize } from './tokenize.js';
import { kgramHashes, winnow } from './winnow.js';

export const ALGO = { k: 6, w: 5, minTokens: 25 } as const;

export interface CodeSample {
  submissionId: string;
  candidate: string;
  language: LanguageKey;
  code: string;
}

export function fingerprint(code: string, language: LanguageKey): { tokens: number; fp: Set<number> } {
  const tokens = tokenize(code, language);
  return { tokens: tokens.length, fp: winnow(kgramHashes(tokens, ALGO.k), ALGO.w) };
}

/**
 * Pure, testable core.
 *  1. Fingerprint every sample (per language — Python vs C++ is not compared).
 *  2. Remove boilerplate: fingerprints from the starter code, and fingerprints shared by
 *     more than half the cohort (common idioms like `for i in range(n)`).
 *  3. Inverted index hash → samples, so only pairs that share something are scored
 *     (avoids a full O(n²) set intersection on large cohorts).
 */
export function compareSamples(samples: CodeSample[], starterCode: Partial<Record<LanguageKey, string>>, threshold: number): SimilarityPair[] {
  const byLang = new Map<LanguageKey, CodeSample[]>();
  for (const s of samples) byLang.set(s.language, [...(byLang.get(s.language) ?? []), s]);

  const pairs: SimilarityPair[] = [];

  for (const [language, group] of byLang) {
    const boilerplate = starterCode[language] ? fingerprint(starterCode[language]!, language).fp : new Set<number>();

    const prints = group
      .map((s) => ({ sample: s, ...fingerprint(s.code, language) }))
      .filter((p) => p.tokens >= ALGO.minTokens)
      .map((p) => ({ sample: p.sample, fp: new Set([...p.fp].filter((h) => !boilerplate.has(h))) }));

    const n = prints.length;
    if (n < 2) continue;

    const df = new Map<number, number>();
    for (const p of prints) for (const h of p.fp) df.set(h, (df.get(h) ?? 0) + 1);
    const maxDf = n >= 5 ? Math.max(2, Math.ceil(n * 0.5)) : n;

    const filtered = prints.map((p) => ({ sample: p.sample, fp: new Set([...p.fp].filter((h) => df.get(h)! <= maxDf)) }));

    const index = new Map<number, number[]>();
    filtered.forEach((p, i) => p.fp.forEach((h) => index.set(h, [...(index.get(h) ?? []), i])));

    const shared = new Map<string, number>();
    for (const posting of index.values()) {
      for (let a = 0; a < posting.length; a++) {
        for (let b = a + 1; b < posting.length; b++) {
          const key = `${posting[a]}:${posting[b]}`;
          shared.set(key, (shared.get(key) ?? 0) + 1);
        }
      }
    }

    for (const [key, common] of shared) {
      const [i, j] = key.split(':').map(Number) as [number, number];
      const A = filtered[i]!;
      const B = filtered[j]!;
      const minSize = Math.min(A.fp.size, B.fp.size);
      if (minSize === 0) continue;
      const containment = common / minSize;
      if (containment < threshold) continue;
      pairs.push({
        submissionA: A.sample.submissionId,
        submissionB: B.sample.submissionId,
        candidateA: A.sample.candidate,
        candidateB: B.sample.candidate,
        language,
        jaccard: round2(common / (A.fp.size + B.fp.size - common)),
        containment: round2(containment),
        sharedFingerprints: common,
      });
    }
  }

  return pairs.sort((a, b) => b.containment - a.containment || b.jaccard - a.jaccard);
}

const MAX_PAIRS_PER_REPORT = 200; // keeps the report doc far below Firestore's 1 MiB limit

/** Runs similarity for every coding question in an exam and writes one report per question. */
export async function runExamSimilarity(examId: string, examinerUid: string, threshold: number) {
  await assertExamOwner(examId, examinerUid);

  const subsSnap = await collections.submissions
    .where('examId', '==', examId)
    .where('status', 'in', ['submitted', 'grading', 'graded', 'grading_failed'])
    .get();
  const subs = subsSnap.docs.map((d) => ({ id: d.id, data: d.data() as SubmissionDoc }));

  const codingIds = new Set<string>();
  for (const s of subs) for (const e of s.data.questionMap) if (e.type === 'coding') codingIds.add(e.questionId);

  const summary: { questionId: string; compared: number; flaggedPairs: number }[] = [];

  for (const questionId of codingIds) {
    const q = (await collections.questions.doc(questionId).get()).data() as QuestionDoc | undefined;
    const starter = q?.type === 'coding' ? (q as CodingQuestion).starterCode : {};

    const samples: CodeSample[] = subs.flatMap(({ id, data }) => {
      const a = data.answers[questionId];
      return a?.type === 'coding' && a.code.trim() ? [{ submissionId: id, candidate: data.candidateEmail, language: a.language, code: a.code }] : [];
    });

    const pairs = compareSamples(samples, starter, threshold);
    const report: SimilarityReportDoc = {
      examId,
      questionId,
      generatedAt: Timestamp.now(),
      generatedBy: examinerUid,
      algorithm: { name: 'winnowing', ...ALGO },
      threshold,
      comparedSubmissions: samples.length,
      pairs: pairs.slice(0, MAX_PAIRS_PER_REPORT),
    };
    await collections.similarityReports.doc(`${examId}_${questionId}`).set(report);
    summary.push({ questionId, compared: samples.length, flaggedPairs: pairs.length });
  }

  return { examId, threshold, questions: summary };
}
