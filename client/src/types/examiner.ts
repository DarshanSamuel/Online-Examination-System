import type { Timestamp } from 'firebase/firestore';
import type { LanguageKey } from './exam';

export const ALL_LANGUAGES: { key: LanguageKey; label: string; monaco: string }[] = [
  { key: 'python', label: 'Python 3', monaco: 'python' },
  { key: 'javascript', label: 'JavaScript (Node)', monaco: 'javascript' },
  { key: 'cpp', label: 'C++', monaco: 'cpp' },
  { key: 'java', label: 'Java', monaco: 'java' },
  { key: 'c', label: 'C', monaco: 'c' },
];

export type Difficulty = 'easy' | 'medium' | 'hard';
export type ComparisonMode = 'exact' | 'trimmed' | 'tokens' | 'float';

interface QuestionBase {
  id: string;
  bankId: string;
  title: string;
  prompt: string;
  points: number;
  difficulty: Difficulty;
  tags: string[];
  createdBy: string;
  version: number;
}

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  weight: number;
  explanation?: string;
}

export interface McqQ extends QuestionBase {
  type: 'mcq';
  options: { id: string; text: string }[];
}
export interface NumQ extends QuestionBase {
  type: 'numerical';
  unit: string | null;
}
export interface CodeQ extends QuestionBase {
  type: 'coding';
  starterCode: Partial<Record<LanguageKey, string>>;
  publicTestCases: TestCase[];
  limits: { cpuTimeSec: number; memoryKb: number };
  comparison: ComparisonMode;
  floatTolerance?: number;
}
export type Question = McqQ | NumQ | CodeQ;

export type AnswerKey =
  | { type: 'mcq'; correctOptionId: string }
  | { type: 'numerical'; value: number; tolerance: { mode: 'absolute' | 'relative'; amount: number } }
  | { type: 'coding'; hiddenTestCases: TestCase[] };

/** Fields the form edits; id/version/createdBy are managed by the data layer. */
export type QuestionInput = Omit<McqQ, 'id' | 'version' | 'createdBy' | 'bankId'>
  | Omit<NumQ, 'id' | 'version' | 'createdBy' | 'bankId'>
  | Omit<CodeQ, 'id' | 'version' | 'createdBy' | 'bankId'>;

export interface ExamSection {
  id: string;
  title: string;
  poolQuestionIds: string[];
  drawCount: number;
  shuffleQuestions: boolean;
  pointsPerQuestion: number | null;
}

export interface ExamSettings {
  shuffleOptions: boolean;
  allowedLanguages: LanguageKey[];
  maxWarnings: number;
  requireFullscreen: boolean;
  requireWebcam: boolean;
  requireMicrophone: boolean;
  snapshotIntervalSec: number;
  audioThresholdDb: number;
  gracePeriodSec: number;
  showResultsToCandidate: boolean;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  instructions: string;
  createdBy: string;
  status: 'draft' | 'published' | 'archived';
  durationMinutes: number;
  window: { opensAt: Timestamp; closesAt: Timestamp };
  sections: ExamSection[];
  settings: ExamSettings;
  totalPoints: number;
}

export interface Assignment {
  id: string;
  examId: string;
  examTitle: string;
  candidateEmail: string;
  candidateUid: string | null;
  status: 'assigned' | 'started' | 'submitted';
}

export interface QuestionGrade {
  score: number;
  maxScore: number;
  status: 'correct' | 'partial' | 'incorrect' | 'unanswered' | 'error';
  tests?: { testCaseId: string; visibility: 'public' | 'hidden'; passed: boolean; status: string; timeSec: number | null }[];
  note?: string;
}

export interface Submission {
  id: string;
  examId: string;
  candidateUid: string;
  candidateEmail: string;
  candidateName: string;
  status: 'in_progress' | 'submitted' | 'grading' | 'graded' | 'grading_failed';
  submitReason: string | null;
  timing: { startedAt: Timestamp; deadlineAt: Timestamp; submittedAt: Timestamp | null };
  questionMap: { questionId: string; sectionId: string; type: 'mcq' | 'numerical' | 'coding'; points: number; order: number; optionOrder: string[] | null }[];
  answers: Record<string, { type: string; selectedOptionId?: string | null; value?: string; language?: LanguageKey; code?: string }>;
  proctoring: {
    warningCount: number;
    tabSwitches: number;
    fullscreenExits: number;
    clipboardAttempts: number;
    blockedShortcuts: number;
    audioFlags: number;
    snapshotCount: number;
    lastHeartbeatAt: Timestamp | null;
  };
  keystrokeStats: Record<string, { chunks: number; events: number; typedChars: number; pastedChars: number; largeInserts: number }>;
  grading: {
    attempts: number;
    totalScore: number | null;
    maxScore: number | null;
    lastError: string | null;
    perQuestion: Record<string, QuestionGrade>;
  };
}

export interface SimilarityPair {
  submissionA: string;
  submissionB: string;
  candidateA: string;
  candidateB: string;
  language: LanguageKey;
  jaccard: number;
  containment: number;
  sharedFingerprints: number;
}

export interface SimilarityReport {
  id: string;
  examId: string;
  questionId: string;
  generatedAt: Timestamp;
  threshold: number;
  comparedSubmissions: number;
  pairs: SimilarityPair[];
}
