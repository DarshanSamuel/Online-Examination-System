/**
 * Firestore schema — single source of truth for document shapes.
 *
 * Collection map (see docs/ARCHITECTURE.md for JSON examples):
 *
 *   users/{uid}
 *   exams/{examId}
 *   assignments/{examId}_{emailLower}
 *   questions/{questionId}
 *   questions/{questionId}/secrets/answerKey        <- examiner/server only
 *   submissions/{examId}_{uid}
 *   submissions/{id}/keystrokes/{questionId}_{chunkSeq}
 *   submissions/{id}/events/{autoId}
 *   submissions/{id}/snapshots/{autoId}
 *   submissions/{id}/runs/{autoId}
 *   similarityReports/{examId}_{questionId}
 */
import type { Timestamp } from 'firebase-admin/firestore';

export const LANGUAGE_KEYS = ['python', 'javascript', 'cpp', 'java', 'c'] as const;
export type LanguageKey = (typeof LANGUAGE_KEYS)[number];

export type Role = 'examiner' | 'candidate';
export type QuestionType = 'mcq' | 'numerical' | 'coding';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** How program stdout is compared with expected output. */
export type ComparisonMode = 'exact' | 'trimmed' | 'tokens' | 'float';

/* ───────────────────────────── users/{uid} ───────────────────────────── */

export interface UserDoc {
  uid: string;
  email: string; // lower-cased
  displayName: string;
  photoURL: string | null;
  /** Mirror of the `role` custom claim. The claim is authoritative. */
  role: Role;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

/* ───────────────────────────── exams/{examId} ─────────────────────────── */

export interface ExamSection {
  id: string;
  title: string;
  /** Pool of eligible questions. `drawCount` of them are picked at random per candidate. */
  poolQuestionIds: string[];
  drawCount: number;
  shuffleQuestions: boolean;
  /** Overrides each question's own `points` when set. */
  pointsPerQuestion: number | null;
}

export interface ExamSettings {
  shuffleOptions: boolean;
  allowedLanguages: LanguageKey[];
  /** Attempt is auto-submitted when warningCount reaches this value. */
  maxWarnings: number;
  /** 0 or undefined = unlimited attempts until window.closesAt; > 0 = max attempts per candidate. */
  maxAttempts?: number;
  requireFullscreen: boolean;
  requireWebcam: boolean;
  requireMicrophone: boolean;
  snapshotIntervalSec: number;
  audioThresholdDb: number;
  /** Network-latency allowance after the deadline for in-flight saves. */
  gracePeriodSec: number;
  showResultsToCandidate: boolean;
}

export interface ExamDoc {
  title: string;
  description: string;
  instructions: string; // markdown
  createdBy: string; // examiner uid
  status: 'draft' | 'published' | 'archived';
  durationMinutes: number;
  window: { opensAt: Timestamp; closesAt: Timestamp };
  sections: ExamSection[];
  settings: ExamSettings;
  totalPoints: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ─────────────────── assignments/{examId}_{emailLower} ─────────────────── */

export interface AssignmentDoc {
  examId: string;
  examTitle: string;
  candidateEmail: string; // lower-cased; lets examiners invite before first login
  candidateUid: string | null; // filled when the attempt starts
  assignedBy: string;
  assignedAt: Timestamp;
  status: 'assigned' | 'started' | 'submitted';
  attemptCount?: number;
  startedAt?: Timestamp;
  submittedAt?: Timestamp;
}

/* ───────────────────────── questions/{questionId} ─────────────────────── */

interface QuestionBase {
  bankId: string;
  type: QuestionType;
  title: string;
  prompt: string; // markdown
  points: number;
  difficulty: Difficulty;
  tags: string[];
  createdBy: string;
  /** Bumped on every edit; recorded in the attempt so grading can detect drift. */
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface McqOption {
  id: string;
  text: string;
}

export interface McqQuestion extends QuestionBase {
  type: 'mcq';
  options: McqOption[];
}

export interface NumericalQuestion extends QuestionBase {
  type: 'numerical';
  unit: string | null;
}

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  /** Relative weight for partial credit. Defaults to 1. */
  weight: number;
}

export interface PublicTestCase extends TestCase {
  explanation?: string;
}

export interface CodingQuestion extends QuestionBase {
  type: 'coding';
  starterCode: Partial<Record<LanguageKey, string>>;
  publicTestCases: PublicTestCase[];
  limits: { cpuTimeSec: number; memoryKb: number };
  comparison: ComparisonMode;
  floatTolerance?: number;
}

export type QuestionDoc = McqQuestion | NumericalQuestion | CodingQuestion;

/* ─────────────── questions/{questionId}/secrets/answerKey ─────────────── */

export type AnswerKeyDoc =
  | { type: 'mcq'; correctOptionId: string }
  | {
      type: 'numerical';
      value: number;
      tolerance: { mode: 'absolute' | 'relative'; amount: number };
    }
  | { type: 'coding'; hiddenTestCases: TestCase[] };

/* ─────────────────────── submissions/{examId}_{uid} ───────────────────── */

export type SubmissionStatus = 'in_progress' | 'submitted' | 'grading' | 'graded' | 'grading_failed';
export type SubmitReason = 'manual' | 'timeout' | 'max_warnings' | 'examiner_terminated';

/** Per-candidate randomized view of the exam, frozen at start time. */
export interface QuestionMapEntry {
  questionId: string;
  sectionId: string;
  type: QuestionType;
  points: number;
  order: number;
  /** MCQ only: option ids in the order this candidate sees them. */
  optionOrder: string[] | null;
  questionVersion: number;
}

export type AnswerValue =
  | { type: 'mcq'; selectedOptionId: string | null }
  | { type: 'numerical'; value: string } // kept as string; parsed strictly at grading
  | { type: 'coding'; language: LanguageKey; code: string };

export type AnswerEntry = AnswerValue & {
  /** Monotonic per-question counter from the client; stale writes are discarded. */
  clientSeq: number;
  /** Client clock (ms). Informational only — never trusted for deadlines. */
  clientSavedAt: number;
  serverSyncedAt: Timestamp;
};

export interface ProctoringSummary {
  warningCount: number;
  tabSwitches: number;
  fullscreenExits: number;
  clipboardAttempts: number;
  blockedShortcuts: number;
  audioFlags: number;
  snapshotCount: number;
  lastViolationAt: Timestamp | null;
  lastHeartbeatAt: Timestamp | null;
}

export interface KeystrokeStats {
  chunks: number;
  events: number;
  typedChars: number;
  pastedChars: number;
  largeInserts: number;
}

export interface TestOutcome {
  testCaseId: string;
  visibility: 'public' | 'hidden';
  passed: boolean;
  status: string;
  timeSec: number | null;
  memoryKb: number | null;
}

export interface QuestionGrade {
  score: number;
  maxScore: number;
  status: 'correct' | 'partial' | 'incorrect' | 'unanswered' | 'error';
  tests?: TestOutcome[];
  note?: string;
}

export interface GradingState {
  attempts: number;
  startedAt: Timestamp | null;
  gradedAt: Timestamp | null;
  lastError: string | null;
  totalScore: number | null;
  maxScore: number | null;
  perQuestion: Record<string, QuestionGrade>;
}

export interface SubmissionDoc {
  examId: string;
  candidateUid: string;
  candidateEmail: string;
  candidateName: string;
  status: SubmissionStatus;
  submitReason: SubmitReason | null;
  attemptCount?: number;
  /** Settings copied at start so every write doesn't need to re-read the exam. */
  examSnapshot: {
    title: string;
    allowedLanguages: LanguageKey[];
    maxWarnings: number;
    gracePeriodSec: number;
  };
  timing: {
    startedAt: Timestamp;
    /** min(startedAt + duration, window.closesAt). The only clock that matters. */
    deadlineAt: Timestamp;
    submittedAt: Timestamp | null;
  };
  questionMap: QuestionMapEntry[];
  answers: Record<string, AnswerEntry>;
  sync: {
    lastServerSyncAt: Timestamp | null;
    lastClientSavedAt: number | null;
    syncCount: number;
  };
  proctoring: ProctoringSummary;
  keystrokeStats: Record<string, KeystrokeStats>;
  grading: GradingState;
  client: { userAgent: string; ip: string | null };
}

/* ─────────────────────────── subcollections ──────────────────────────── */

/**
 * Compact keystroke event (short keys to keep chunk docs small).
 * Firestore forbids nested arrays, so events are maps, not tuples.
 *
 *  k: 'e' edit | 'p' paste-edit | 'l' language switch | 'r' reset to starter
 *     'b' editor blur | 'f' editor focus
 *  t: ms since chunk.clientStartedAt
 *  o: rangeOffset, d: rangeLength (chars deleted), i: inserted text
 *  For 'l' and 'r', `i` holds the full new document and `v` the language.
 */
export type KeystrokeKind = 'e' | 'p' | 'l' | 'r' | 'b' | 'f';

export interface KeystrokeEvent {
  t: number;
  k: KeystrokeKind;
  o?: number;
  d?: number;
  i?: string;
  v?: LanguageKey;
}

/** submissions/{id}/keystrokes/{questionId}_{chunkSeq:000000} */
export interface KeystrokeChunkDoc {
  questionId: string;
  chunkSeq: number;
  language: LanguageKey;
  clientStartedAt: number;
  events: KeystrokeEvent[];
  serverReceivedAt: Timestamp;
}

export const PROCTOR_EVENT_TYPES = [
  'tab_hidden',
  'tab_visible',
  'window_blur',
  'fullscreen_exit',
  'fullscreen_enter',
  'copy',
  'cut',
  'paste',
  'context_menu',
  'blocked_shortcut',
  'devtools_suspected',
  'audio_spike',
  'camera_lost',
  'no_face',
  'multiple_faces',
  'network_offline',
  'network_online',
  'snapshot',
  'heartbeat',
] as const;
export type ProctorEventType = (typeof PROCTOR_EVENT_TYPES)[number];

/** submissions/{id}/events/{autoId} */
export interface ProctorEventDoc {
  type: ProctorEventType;
  clientTs: number;
  serverTs: Timestamp;
  countedAsViolation: boolean;
  meta: Record<string, string | number | boolean>;
}

/** submissions/{id}/snapshots/{autoId} — image lives in Cloud Storage. */
export interface SnapshotDoc {
  storagePath: string; // proctoring/{examId}/{uid}/{clientTs}.jpg
  clientTs: number;
  serverTs: Timestamp;
  audioLevelDb: number | null;
  flagged: boolean;
  flags: string[];
}

/** submissions/{id}/runs/{autoId} — "Run code" history (public tests only). */
export interface CodeRunDoc {
  questionId: string;
  language: LanguageKey;
  codeSha256: string;
  mode: 'tests' | 'custom';
  passed: number;
  total: number;
  serverTs: Timestamp;
}

/* ─────────────── similarityReports/{examId}_{questionId} ─────────────── */

export interface SimilarityPair {
  submissionA: string;
  submissionB: string;
  candidateA: string;
  candidateB: string;
  language: LanguageKey;
  /** |A∩B| / |A∪B| */
  jaccard: number;
  /** |A∩B| / min(|A|,|B|) — catches a small program embedded in a larger one. */
  containment: number;
  sharedFingerprints: number;
}

export interface SimilarityReportDoc {
  examId: string;
  questionId: string;
  generatedAt: Timestamp;
  generatedBy: string;
  algorithm: { name: 'winnowing'; k: number; w: number; minTokens: number };
  threshold: number;
  comparedSubmissions: number;
  pairs: SimilarityPair[];
}
