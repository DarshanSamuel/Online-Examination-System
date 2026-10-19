/** Client-side mirror of the candidate-safe payloads returned by the API (server/src/services/attempts/view.ts). */

export type LanguageKey = 'python' | 'javascript' | 'cpp' | 'java' | 'c';
export type Role = 'examiner' | 'candidate';

export type AnswerValue =
  | { type: 'mcq'; selectedOptionId: string | null }
  | { type: 'numerical'; value: string }
  | { type: 'coding'; language: LanguageKey; code: string };

/** One locally-saved answer. `clientSeq` increases on every edit; the server drops stale writes. */
export interface LocalAnswer {
  questionId: string;
  clientSeq: number;
  clientSavedAt: number;
  answer: AnswerValue;
}

interface QuestionCommon {
  questionId: string;
  sectionId: string;
  order: number;
  title: string;
  prompt: string;
  points: number;
}

export interface McqQuestion extends QuestionCommon {
  type: 'mcq';
  options: { id: string; text: string }[];
}

export interface NumericalQuestion extends QuestionCommon {
  type: 'numerical';
  unit: string | null;
}

export interface CodingQuestion extends QuestionCommon {
  type: 'coding';
  languages: { key: LanguageKey; label: string; monaco: string; starterCode: string }[];
  publicTestCases: { id: string; input: string; expectedOutput: string; explanation?: string }[];
  limits: { cpuTimeSec: number; memoryKb: number };
}

export type CandidateQuestion = McqQuestion | NumericalQuestion | CodingQuestion;

export interface ProctoringConfig {
  requireFullscreen: boolean;
  requireWebcam: boolean;
  requireMicrophone: boolean;
  snapshotIntervalSec: number;
  audioThresholdDb: number;
}

export interface AttemptView {
  submissionId: string;
  examId: string;
  examTitle: string;
  instructions: string;
  status: 'in_progress' | 'submitted' | 'grading' | 'graded' | 'grading_failed';
  submitReason: string | null;
  startedAt: number;
  deadlineAt: number;
  serverNow: number;
  maxWarnings: number;
  warningCount: number;
  proctoring: ProctoringConfig;
  questions: CandidateQuestion[];
  answers: Record<string, AnswerValue & { clientSeq: number; clientSavedAt: number; serverSyncedAt: number }>;
}

export interface StartResult {
  submissionId: string;
  resumed: boolean;
  startedAt: number;
  deadlineAt: number;
  serverNow: number;
}

export interface ProctorResult {
  warningCount: number;
  maxWarnings: number;
  autoSubmitted: boolean;
}

export type ProctorEventType =
  | 'tab_hidden' | 'tab_visible' | 'window_blur' | 'fullscreen_exit' | 'fullscreen_enter'
  | 'copy' | 'cut' | 'paste' | 'context_menu' | 'blocked_shortcut' | 'devtools_suspected'
  | 'audio_spike' | 'camera_lost' | 'no_face' | 'multiple_faces'
  | 'network_offline' | 'network_online' | 'snapshot' | 'heartbeat';

export interface ProctorEvent {
  type: ProctorEventType;
  clientTs: number;
  meta?: Record<string, string | number | boolean>;
}

/** Compact replay event — see KeystrokeEvent in server/src/types/schema.ts. */
export interface KeystrokeEvent {
  t: number;
  k: 'e' | 'p' | 'l' | 'r' | 'b' | 'f';
  o?: number;
  d?: number;
  i?: string;
  v?: LanguageKey;
}

export interface RunTestResult {
  testCaseId: string;
  passed: boolean;
  status: string;
  input: string;
  expectedOutput: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  timeSec: number | null;
  memoryKb: number | null;
}

export type RunResponse =
  | { mode: 'tests'; passed: number; total: number; results: RunTestResult[] }
  | { mode: 'custom'; result: { status: string; stdout: string; stderr: string; compileOutput: string; timeSec: number | null; memoryKb: number | null } };

export interface AssignmentDoc {
  examId: string;
  examTitle: string;
  candidateEmail: string;
  status: 'assigned' | 'started' | 'submitted';
}
