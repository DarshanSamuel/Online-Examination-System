import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Assignment, AnswerKey, Exam, Question, QuestionInput, Submission } from '../types/examiner';

/** Firestore rejects `undefined`; strip it recursively while preserving Firestore Timestamps. */
export function clean<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (
    value instanceof Timestamp ||
    value instanceof Date ||
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => clean(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      out[k] = clean(v);
    }
  }
  return out as T;
}

/** Safely coerce a Firestore Timestamp or plain { seconds, nanoseconds } map back to a Timestamp. */
export function asTimestamp(v: unknown): Timestamp {
  if (v instanceof Timestamp) return v;
  if (v && typeof v === 'object') {
    if (typeof (v as { toDate?: unknown }).toDate === 'function') return v as Timestamp;
    const sec = (v as { seconds?: number; _seconds?: number }).seconds ?? (v as { _seconds?: number })._seconds;
    const nano = (v as { nanoseconds?: number; _nanoseconds?: number }).nanoseconds ?? (v as { _nanoseconds?: number })._nanoseconds ?? 0;
    if (typeof sec === 'number') return new Timestamp(sec, nano);
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  }
  return Timestamp.now();
}

export function normalizeExam(id: string, raw: Record<string, unknown>): Exam {
  const e = { id, ...(raw as Omit<Exam, 'id'>) } as Exam;
  const win = (raw.window ?? {}) as { opensAt?: unknown; closesAt?: unknown };
  return {
    ...e,
    window: {
      opensAt: asTimestamp(win.opensAt),
      closesAt: asTimestamp(win.closesAt),
    },
  };
}

/* ───────────────────────────── questions ───────────────────────────── */

export async function listQuestions(uid: string): Promise<Question[]> {
  const snap = await getDocs(query(collection(db, 'questions'), where('createdBy', '==', uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Question, 'id'>) }) as Question)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadQuestion(id: string): Promise<{ question: Question; key: AnswerKey }> {
  const [q, k] = await Promise.all([getDoc(doc(db, 'questions', id)), getDoc(doc(db, 'questions', id, 'secrets', 'answerKey'))]);
  if (!q.exists() || !k.exists()) throw new Error('Question not found');
  return { question: { id, ...(q.data() as Omit<Question, 'id'>) } as Question, key: k.data() as AnswerKey };
}

/**
 * Create or update a question + its answer key.
 * Written sequentially: the secrets rule calls get() on the parent question, which must already
 * exist. Updates bump `version` by exactly one (enforced by the Firestore rules).
 */
export async function saveQuestion(uid: string, input: QuestionInput, key: AnswerKey, existingId?: string, bankId = 'default'): Promise<string> {
  const now = Timestamp.now();
  if (existingId) {
    const ref = doc(db, 'questions', existingId);
    const current = (await getDoc(ref)).data() as { version: number } | undefined;
    if (!current) throw new Error('Question no longer exists');
    await updateDoc(ref, clean({ ...input, version: current.version + 1, updatedAt: now }));
    await setDoc(doc(db, 'questions', existingId, 'secrets', 'answerKey'), clean(key));
    return existingId;
  }
  const ref = doc(collection(db, 'questions'));
  await setDoc(ref, clean({ ...input, bankId, createdBy: uid, version: 1, createdAt: now, updatedAt: now }));
  await setDoc(doc(db, 'questions', ref.id, 'secrets', 'answerKey'), clean(key));
  return ref.id;
}

/** Move a question to a different bank (bumps version to satisfy Firestore rules). */
export async function moveQuestionToBank(questionId: string, newBankId: string): Promise<void> {
  const ref = doc(db, 'questions', questionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Question not found');
  const current = snap.data() as { version: number };
  await updateDoc(ref, { bankId: newBankId, version: current.version + 1, updatedAt: Timestamp.now() });
}

/** Exams (of this examiner) whose pools reference the question. */
export async function examsUsingQuestion(uid: string, questionId: string): Promise<string[]> {
  const exams = await listExams(uid);
  return exams.filter((e) => e.sections.some((s) => s.poolQuestionIds.includes(questionId))).map((e) => e.title);
}

export async function deleteQuestion(id: string) {
  await deleteDoc(doc(db, 'questions', id, 'secrets', 'answerKey'));
  await deleteDoc(doc(db, 'questions', id));
}

/* ───────────────────────────── exams ───────────────────────────── */

export async function listExams(uid: string): Promise<Exam[]> {
  const snap = await getDocs(query(collection(db, 'exams'), where('createdBy', '==', uid)));
  return snap.docs
    .map((d) => normalizeExam(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => b.window.opensAt.toMillis() - a.window.opensAt.toMillis());
}

export type ExamInput = Omit<Exam, 'id' | 'createdBy' | 'status'>;

/** New exams are always created as drafts (Firestore rule); publish is a separate update. */
export async function createExam(uid: string, input: ExamInput): Promise<string> {
  const ref = doc(collection(db, 'exams'));
  const now = Timestamp.now();
  await setDoc(ref, clean({ ...input, window: input.window, createdBy: uid, status: 'draft', createdAt: now, updatedAt: now }));
  return ref.id;
}

export async function updateExam(id: string, input: ExamInput) {
  await updateDoc(doc(db, 'exams', id), clean({ ...input, updatedAt: Timestamp.now() }));
}

export async function setExamStatus(id: string, status: Exam['status']) {
  await updateDoc(doc(db, 'exams', id), { status, updatedAt: Timestamp.now() });
}

export async function deleteDraftExam(id: string) {
  await deleteDoc(doc(db, 'exams', id));
}

/* ─────────────────────────── assignments ─────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(parts)];
  return { valid: unique.filter((e) => EMAIL_RE.test(e)), invalid: unique.filter((e) => !EMAIL_RE.test(e)) };
}

export async function assignCandidates(exam: Exam, emails: string[], examinerUid: string) {
  await Promise.all(
    emails.map((email) =>
      setDoc(doc(db, 'assignments', `${exam.id}_${email}`), {
        examId: exam.id,
        examTitle: exam.title,
        candidateEmail: email,
        candidateUid: null,
        assignedBy: examinerUid,
        assignedAt: Timestamp.now(),
        status: 'assigned',
      }),
    ),
  );
}

export const removeAssignment = (a: Assignment) => deleteDoc(doc(db, 'assignments', a.id));

/* ───────────────────────────── results ───────────────────────────── */

export function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  // Prevent spreadsheet formula injection from candidate-controlled names/emails.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function resultsToCsv(subs: Submission[]): string {
  const header = ['Name', 'Email', 'Status', 'Attempts Count', 'Latest Score', 'Max', 'Percent', 'All Attempts History', 'Warnings', 'Tab switches', 'Fullscreen exits', 'Clipboard attempts', 'Audio flags', 'Submit reason', 'Started', 'Submitted'];
  const rows = subs.map((s) => {
    const pct = s.grading.totalScore != null && s.grading.maxScore ? ((s.grading.totalScore / s.grading.maxScore) * 100).toFixed(1) : '';
    const historyStr = (s.attemptHistory ?? [])
      .map((h) => `#${h.attemptNumber}: ${h.totalScore ?? '-'}/${h.maxScore ?? '-'}`)
      .join(' | ');
    return [
      s.candidateName,
      s.candidateEmail,
      s.status,
      s.attemptCount ?? 1,
      s.grading.totalScore ?? '',
      s.grading.maxScore ?? '',
      pct,
      historyStr || `#1: ${s.grading.totalScore ?? '-'}/${s.grading.maxScore ?? '-'}`,
      s.proctoring.warningCount,
      s.proctoring.tabSwitches,
      s.proctoring.fullscreenExits,
      s.proctoring.clipboardAttempts,
      s.proctoring.audioFlags,
      s.submitReason ?? '',
      asTimestamp(s.timing.startedAt).toDate().toISOString(),
      s.timing.submittedAt ? asTimestamp(s.timing.submittedAt).toDate().toISOString() : '',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** `datetime-local` value ↔ Date helpers (local time, no timezone suffix). */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
