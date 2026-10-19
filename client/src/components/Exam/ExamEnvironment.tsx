import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, Send, ShieldAlert } from 'lucide-react';
import { useExamStore, type SyncStatus } from '../../store/examStore';
import { useNetworkSync } from '../../hooks/useNetworkSync';
import { flushProctorEvents, resetProctorQueue } from '../../lib/proctorQueue';
import { AntiCheatProvider } from './AntiCheatProvider';
import { ProctoringEngine } from './ProctoringEngine';
import { Timer } from './Timer';
import { CodeEditor } from './CodeEditor';
import { MCQQuestion, NumericalQuestion } from './QuestionTypes';
import { ExamEnded } from './ExamEnded';
import { FullPageSpinner } from '../ui/FullPageSpinner';
import { ThemeToggle } from '../ui/ThemeToggle';
import { btnGhost, btnPrimary, card } from '../ui/styles';
import { cn } from '../../lib/utils';
import { apiErrorMessage } from '../../lib/api';
import type { LocalAnswer } from '../../types/exam';

function isAnswered(a: LocalAnswer | undefined): boolean {
  if (!a) return false;
  const v = a.answer;
  if (v.type === 'mcq') return !!v.selectedOptionId;
  if (v.type === 'numerical') return v.value.trim() !== '';
  return v.code.trim() !== '';
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  saved: 'All changes saved',
  pending: 'Saved locally',
  syncing: 'Syncing…',
  offline: 'Offline — saved locally',
  error: 'Sync failed — retrying',
};

function SyncBadge({ status }: { status: SyncStatus }) {
  const Icon = status === 'offline' || status === 'error' ? CloudOff : status === 'syncing' ? Loader2 : Cloud;
  return (
    <span className={cn('hidden items-center gap-1.5 text-xs font-medium transition-colors sm:flex', status === 'offline' || status === 'error' ? 'text-amber-600' : 'text-slate-500')}>
      <Icon className={cn('h-4 w-4', status === 'syncing' && 'animate-spin')} />
      {SYNC_LABEL[status]}
    </span>
  );
}

export function ExamEnvironment({ submissionId }: { submissionId: string }) {
  const s = useExamStore();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useNetworkSync();

  useEffect(() => {
    resetProctorQueue();
    s.load(submissionId).catch((err) => setLoadError(apiErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="animate-modal-pop max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-lg">
          <p className="font-semibold text-red-700">Could not load the exam</p>
          <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        </div>
      </div>
    );
  }
  if (s.phase === 'ended') return <ExamEnded reason={s.endReason} title={s.examTitle} />;
  if (s.phase === 'idle' || s.phase === 'loading' || !s.questions.length) return <FullPageSpinner label="Loading your exam…" />;

  const q = s.questions[s.currentIndex]!;
  const answeredCount = s.questions.filter((x) => isAnswered(s.answers[x.questionId])).length;

  const doSubmit = async () => {
    setConfirming(false);
    await flushProctorEvents();
    await s.submit('manual');
  };

  return (
    <AntiCheatProvider>
      <ProctoringEngine />
      <div className="flex h-screen flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-5 py-3 backdrop-blur-md">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-900">{s.examTitle}</h1>
            <p className="text-xs text-slate-500">
              {answeredCount}/{s.questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SyncBadge status={s.syncStatus} />
            <span
              title="Warnings recorded by the server"
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                s.warningCount ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200' : 'bg-slate-100 text-slate-600',
              )}
            >
              <ShieldAlert className="h-3.5 w-3.5" /> {s.warningCount}/{s.maxWarnings}
            </span>
            <Timer />
            <ThemeToggle />
            <button onClick={() => setConfirming(true)} disabled={s.phase === 'submitting'} className={btnPrimary}>
              {s.phase === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {s.phase === 'submitting' ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </header>

        {/* Question body + dynamic navigator positioned right below the answer section */}
        <main className="min-h-0 flex-1 overflow-auto p-5">
          <div
            className={cn('mx-auto space-y-4 pb-8', q.type === 'coding' ? 'max-w-[1600px]' : 'max-w-3xl')}
          >
            <div key={q.questionId} className="animate-tab-enter">
              {q.type === 'mcq' && <MCQQuestion question={q} index={s.currentIndex} />}
              {q.type === 'numerical' && <NumericalQuestion question={q} index={s.currentIndex} />}
              {q.type === 'coding' && <CodeEditor question={q} index={s.currentIndex} />}
            </div>

            {/* Dynamic Question Palette directly below the question card */}
            <nav
              aria-label="Question navigator"
              className={cn(card, 'flex flex-wrap items-center justify-between gap-3 px-5 py-3.5')}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Questions ({answeredCount}/{s.questions.length} answered)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.questions.map((x, i) => (
                  <button
                    key={x.questionId}
                    onClick={() => s.goTo(i)}
                    title={`${x.type.toUpperCase()} · ${x.points} pts`}
                    className={cn(
                      'h-8.5 w-8.5 cursor-pointer rounded-xl text-sm font-semibold transition-all duration-200 ease-out active:scale-90',
                      i === s.currentIndex
                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30 scale-105'
                        : isAnswered(s.answers[x.questionId])
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        </main>
      </div>

      {confirming && (
        <div className="animate-modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-xs">
          <div className="animate-modal-pop w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Submit exam?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You answered {answeredCount} of {s.questions.length} questions. You can't make changes after submitting.
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button onClick={() => setConfirming(false)} className={btnGhost}>
                Keep working
              </button>
              <button onClick={doSubmit} className={btnPrimary}>
                Submit now
              </button>
            </div>
          </div>
        </div>
      )}
    </AntiCheatProvider>
  );
}
