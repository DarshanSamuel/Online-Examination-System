import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Cloud, CloudOff, Loader2, Send, ShieldAlert } from 'lucide-react';
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
    <span className={cn('hidden items-center gap-1.5 text-xs sm:flex', status === 'offline' || status === 'error' ? 'text-amber-600' : 'text-slate-500')}>
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
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
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
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">{s.examTitle}</h1>
            <p className="text-xs text-slate-500">
              {answeredCount}/{s.questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SyncBadge status={s.syncStatus} />
            <span
              title="Warnings recorded by the server"
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                s.warningCount ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600',
              )}
            >
              <ShieldAlert className="h-3.5 w-3.5" /> {s.warningCount}/{s.maxWarnings}
            </span>
            <Timer />
            <button
              onClick={() => setConfirming(true)}
              disabled={s.phase === 'submitting'}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {s.phase === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {s.phase === 'submitting' ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </header>

        {/* Question body */}
        <main className="min-h-0 flex-1 overflow-auto p-5">
          <div className={cn('mx-auto h-full', q.type === 'coding' ? 'max-w-[1600px]' : 'max-w-3xl')}>
            {q.type === 'mcq' && <MCQQuestion key={q.questionId} question={q} index={s.currentIndex} />}
            {q.type === 'numerical' && <NumericalQuestion key={q.questionId} question={q} index={s.currentIndex} />}
            {q.type === 'coding' && <CodeEditor key={q.questionId} question={q} index={s.currentIndex} />}
          </div>
        </main>

        {/* Navigator */}
        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-3">
          <button
            onClick={() => s.goTo(s.currentIndex - 1)}
            disabled={s.currentIndex === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <nav className="flex flex-wrap justify-center gap-1.5">
            {s.questions.map((x, i) => (
              <button
                key={x.questionId}
                onClick={() => s.goTo(i)}
                title={`${x.type.toUpperCase()} · ${x.points} pts`}
                className={cn(
                  'h-8 w-8 rounded-md text-sm font-medium transition-colors',
                  i === s.currentIndex
                    ? 'bg-primary-600 text-white'
                    : isAnswered(s.answers[x.questionId])
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {i + 1}
              </button>
            ))}
          </nav>
          <button
            onClick={() => s.goTo(s.currentIndex + 1)}
            disabled={s.currentIndex === s.questions.length - 1}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </footer>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Submit exam?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You answered {answeredCount} of {s.questions.length} questions. You can't make changes after submitting.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Keep working
              </button>
              <button onClick={doSubmit} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                Submit now
              </button>
            </div>
          </div>
        </div>
      )}
    </AntiCheatProvider>
  );
}
