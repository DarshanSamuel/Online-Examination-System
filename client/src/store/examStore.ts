import { create } from 'zustand';
import { api, apiErrorCode, ATTEMPT_OVER_CODES } from '../lib/api';
import type { AnswerValue, AttemptView, CandidateQuestion, LocalAnswer, ProctoringConfig } from '../types/exam';

type Phase = 'idle' | 'loading' | 'active' | 'submitting' | 'ended';
export type SyncStatus = 'saved' | 'pending' | 'syncing' | 'offline' | 'error';

interface PersistedState {
  answers: Record<string, LocalAnswer>;
  /** Question ids edited since the last acknowledged sync. */
  pending: string[];
}

const storageKey = (submissionId: string) => `exam:${submissionId}:v1`;

function readLocal(submissionId: string): PersistedState {
  try {
    const raw = localStorage.getItem(storageKey(submissionId));
    if (raw) return JSON.parse(raw) as PersistedState;
  } catch {
    /* corrupted entry — fall back to server state */
  }
  return { answers: {}, pending: [] };
}

function writeLocal(submissionId: string, state: PersistedState) {
  try {
    localStorage.setItem(storageKey(submissionId), JSON.stringify(state));
  } catch {
    /* quota exceeded / private mode — the 30s server sync still protects the answers */
  }
}

interface ExamState {
  phase: Phase;
  endReason: string | null;
  submissionId: string | null;
  examId: string | null;
  examTitle: string;
  questions: CandidateQuestion[];
  currentIndex: number;
  answers: Record<string, LocalAnswer>;
  pending: Set<string>;
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
  /** Server-authoritative deadline (epoch ms). */
  deadlineAt: number;
  /** serverNow − Date.now(), so the countdown ignores a wrong local clock. */
  clockOffsetMs: number;
  warningCount: number;
  maxWarnings: number;
  proctoring: ProctoringConfig | null;

  load: (submissionId: string) => Promise<void>;
  goTo: (index: number) => void;
  saveAnswer: (questionId: string, answer: AnswerValue) => void;
  flush: () => Promise<void>;
  submit: (reason: 'manual' | 'timeout') => Promise<void>;
  setWarnings: (count: number, max: number) => void;
  end: (reason: string) => void;
  serverNow: () => number;
}

export const useExamStore = create<ExamState>((set, get) => {
  const persist = () => {
    const { submissionId, answers, pending } = get();
    if (submissionId) writeLocal(submissionId, { answers, pending: [...pending] });
  };

  const buildBatch = () => {
    const { answers, pending } = get();
    return [...pending].flatMap((qid) => (answers[qid] ? [answers[qid]] : []));
  };

  return {
    phase: 'idle',
    endReason: null,
    submissionId: null,
    examId: null,
    examTitle: '',
    questions: [],
    currentIndex: 0,
    answers: {},
    pending: new Set(),
    syncStatus: 'saved',
    lastSyncedAt: null,
    deadlineAt: 0,
    clockOffsetMs: 0,
    warningCount: 0,
    maxWarnings: 3,
    proctoring: null,

    async load(submissionId) {
      set({ phase: 'loading', submissionId });
      const sentAt = Date.now();
      const { data } = await api.get<AttemptView>(`/attempts/${submissionId}`);
      // Assume the server stamped serverNow halfway through the round trip.
      const clockOffsetMs = data.serverNow - (sentAt + Date.now()) / 2;

      if (data.status !== 'in_progress') {
        set({ phase: 'ended', endReason: data.submitReason ?? 'submitted', examTitle: data.examTitle });
        return;
      }

      // Merge: whichever copy has the higher clientSeq wins (handles crash-before-sync and device switches).
      const local = readLocal(submissionId);
      const answers: Record<string, LocalAnswer> = {};
      for (const [qid, a] of Object.entries(data.answers)) {
        const { clientSeq, clientSavedAt, serverSyncedAt: _s, ...answer } = a;
        answers[qid] = { questionId: qid, clientSeq, clientSavedAt, answer: answer as AnswerValue };
      }
      const pending = new Set<string>();
      for (const [qid, la] of Object.entries(local.answers)) {
        if (!answers[qid] || la.clientSeq > answers[qid].clientSeq) {
          answers[qid] = la;
          pending.add(qid);
        }
      }

      set({
        phase: 'active',
        examId: data.examId,
        examTitle: data.examTitle,
        questions: data.questions,
        currentIndex: 0,
        answers,
        pending,
        syncStatus: pending.size ? 'pending' : 'saved',
        deadlineAt: data.deadlineAt,
        clockOffsetMs,
        warningCount: data.warningCount,
        maxWarnings: data.maxWarnings,
        proctoring: data.proctoring,
      });
      persist();
    },

    goTo(index) {
      const { questions } = get();
      if (index >= 0 && index < questions.length) set({ currentIndex: index });
    },

    saveAnswer(questionId, answer) {
      if (get().phase !== 'active') return;
      const prev = get().answers[questionId];
      const entry: LocalAnswer = { questionId, clientSeq: (prev?.clientSeq ?? 0) + 1, clientSavedAt: Date.now(), answer };
      const pending = new Set(get().pending).add(questionId);
      set({ answers: { ...get().answers, [questionId]: entry }, pending, syncStatus: 'pending' });
      persist(); // localStorage first — survives refresh, crash and network loss.
    },

    async flush() {
      const { submissionId, phase, syncStatus } = get();
      if (!submissionId || phase !== 'active' || syncStatus === 'syncing') return;
      const batch = buildBatch();
      if (!batch.length) return;
      if (!navigator.onLine) {
        set({ syncStatus: 'offline' });
        return;
      }

      set({ syncStatus: 'syncing' });
      try {
        await api.post(`/attempts/${submissionId}/sync`, { answers: batch });
        // Only clear entries that weren't edited again while the request was in flight.
        const pending = new Set(get().pending);
        for (const sent of batch) {
          if (get().answers[sent.questionId]?.clientSeq === sent.clientSeq) pending.delete(sent.questionId);
        }
        set({ pending, syncStatus: pending.size ? 'pending' : 'saved', lastSyncedAt: Date.now() });
        persist();
      } catch (err) {
        const code = apiErrorCode(err);
        if (code && ATTEMPT_OVER_CODES.has(code)) {
          get().end(code === 'ATTEMPT_EXPIRED' ? 'timeout' : 'submitted');
          return;
        }
        set({ syncStatus: navigator.onLine ? 'error' : 'offline' });
      }
    },

    async submit(reason) {
      const { submissionId, phase } = get();
      if (!submissionId || (phase !== 'active' && phase !== 'loading')) return;
      set({ phase: 'submitting' });
      const answers = buildBatch();

      // Retry a few times: a dropped request here must not lose the attempt.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await api.post(`/attempts/${submissionId}/submit`, { reason, answers });
          localStorage.removeItem(storageKey(submissionId));
          get().end(reason);
          return;
        } catch (err) {
          const code = apiErrorCode(err);
          if (code && ATTEMPT_OVER_CODES.has(code)) {
            get().end(reason);
            return;
          }
          await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
        }
      }
      // Still failing: stay on the page. The server sweeper finalizes at the deadline anyway.
      set({ phase: 'active', syncStatus: 'error' });
    },

    setWarnings(count, max) {
      set({ warningCount: count, maxWarnings: max });
    },

    end(reason) {
      set({ phase: 'ended', endReason: reason });
    },

    serverNow() {
      return Date.now() + get().clockOffsetMs;
    },
  };
});
