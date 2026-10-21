import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, PlayCircle, Repeat, RotateCcw } from 'lucide-react';
import { db } from '../lib/firebase';
import { asTimestamp } from '../lib/examinerData';
import { useAuth } from '../auth/AuthProvider';
import type { AssignmentDoc } from '../types/exam';
import { AppHeader } from '../components/ui/AppHeader';
import { btnGhost, btnPrimary, card, statusTone } from '../components/ui/styles';
import { cn } from '../lib/utils';

interface PublishedExamDoc {
  id: string;
  title: string;
  status: string;
  closesAtMs: number | null;
  maxAttempts: number;
}

export function formatTimeRemaining(closesAtMs: number, nowMs: number): string {
  const diff = closesAtMs - nowMs;
  if (diff <= 0) return 'Submissions closed';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Closes in < 1m';
  if (mins < 60) return `Closes in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `Closes in ${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `Closes in ${days}d ${remHours}h`;
}

/**
 * Candidate home: shows only exams explicitly assigned/admitted to the candidate's email
 * that are currently published.
 */
export function CandidateHome() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<(AssignmentDoc & { id: string })[] | null>(null);
  const [publishedExams, setPublishedExams] = useState<PublishedExamDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email.toLowerCase();
    const unsubAsg = onSnapshot(
      query(collection(db, 'assignments'), where('candidateEmail', '==', email)),
      (snap) => setAssignments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AssignmentDoc) }))),
      () => setError('Could not load your exams.'),
    );
    const unsubExams = onSnapshot(
      query(collection(db, 'exams'), where('status', '==', 'published')),
      (snap) =>
        setPublishedExams(
          snap.docs.map((d) => {
            const data = d.data() as {
              title: string;
              status: string;
              window?: { closesAt?: unknown };
              settings?: { maxAttempts?: number };
            };
            return {
              id: d.id,
              title: data.title,
              status: data.status,
              closesAtMs: data.window?.closesAt ? asTimestamp(data.window.closesAt).toMillis() : null,
              maxAttempts: data.settings?.maxAttempts ?? 0,
            };
          }),
        ),
      () => setPublishedExams([]),
    );
    return () => {
      unsubAsg();
      unsubExams();
    };
  }, [user?.email]);

  const examMetaById = useMemo(
    () => new Map((publishedExams ?? []).map((e) => [e.id, e])),
    [publishedExams],
  );

  const items = useMemo(() => {
    if (assignments === null || publishedExams === null) return null;
    const byExamId = new Map<string, AssignmentDoc & { id: string }>();

    for (const a of assignments) {
      if (!examMetaById.has(a.examId)) continue;
      const meta = examMetaById.get(a.examId);
      byExamId.set(a.examId, {
        ...a,
        examTitle: meta?.title || a.examTitle,
      });
    }

    return Array.from(byExamId.values());
  }, [assignments, publishedExams, examMetaById]);

  return (
    <div className="min-h-screen bg-transparent">
      <AppHeader />
      <main className="animate-page-enter mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My exams</h1>
        <p className="mt-1 text-sm text-slate-500">Assigned exams for {user?.email}</p>

        {error && <p className="mt-6 text-red-600">{error}</p>}
        {items === null && !error && <p className="mt-6 animate-pulse text-slate-400">Loading…</p>}
        {items?.length === 0 && (
          <div className="animate-tab-enter mt-10 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-500">
            <ClipboardList className="mb-3 h-8 w-8 text-slate-400" />
            No exams registered for your account yet.
          </div>
        )}

        <ul className="mt-6 space-y-3.5">
          {items?.map((a) => {
            const meta = examMetaById.get(a.examId);
            const usedAttempts = a.attemptCount ?? (a.status === 'submitted' ? 1 : 0);
            const maxAttempts = meta?.maxAttempts ?? 0; // 0 = unlimited until closing time
            const attemptsLeft = maxAttempts > 0 ? Math.max(0, maxAttempts - usedAttempts) : null;
            const closesAtMs = meta?.closesAtMs ?? null;
            const isClosed = closesAtMs != null && nowMs >= closesAtMs;
            const canReattempt = a.status === 'submitted' && !isClosed && (attemptsLeft === null || attemptsLeft > 0);

            return (
              <li
                key={a.id}
                className={cn(
                  card,
                  'flex flex-wrap items-center justify-between gap-4 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/90 hover:shadow-md',
                )}
              >
                <div className="space-y-1.5">
                  <p className="font-semibold text-slate-900">{a.examTitle}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn('inline-block rounded-full px-2.5 py-0.5 font-medium capitalize', statusTone[a.status])}>
                      {a.status}
                    </span>

                    {/* Attempts indicator */}
                    {maxAttempts > 0 ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ring-1 ring-inset',
                          attemptsLeft && attemptsLeft > 0
                            ? 'bg-primary-50 text-primary-700 ring-primary-200'
                            : 'bg-slate-100 text-slate-600 ring-slate-200',
                        )}
                      >
                        <Repeat className="h-3 w-3" />
                        {attemptsLeft && attemptsLeft > 0
                          ? `${attemptsLeft} of ${maxAttempts} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left`
                          : `No attempts left (${usedAttempts}/${maxAttempts} used)`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600 ring-1 ring-inset ring-slate-200/80">
                        <Repeat className="h-3 w-3" />
                        {usedAttempts > 0 ? `Attempt #${usedAttempts} completed · Unlimited until close` : 'Unlimited attempts until close'}
                      </span>
                    )}

                    {/* Closing time countdown */}
                    {closesAtMs != null && (
                      <span
                        title={`Closes at ${new Date(closesAtMs).toLocaleString()}`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ring-1 ring-inset',
                          isClosed
                            ? 'bg-red-50 text-red-700 ring-red-200'
                            : 'bg-amber-50/80 text-amber-800 ring-amber-200/80',
                        )}
                      >
                        <CalendarClock className="h-3 w-3" />
                        {formatTimeRemaining(closesAtMs, nowMs)}
                      </span>
                    )}
                  </div>
                </div>

                {a.status === 'submitted' ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      to={`/exam/${a.examId}/result`}
                      className={cn(
                        canReattempt ? btnGhost : 'inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100/80 active:scale-95',
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> View result
                    </Link>
                    {canReattempt && (
                      <Link to={`/exam/${a.examId}/lobby`} className={btnPrimary}>
                        <RotateCcw className="h-4 w-4" /> Reattempt
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link
                    to={`/exam/${a.examId}/lobby`}
                    className={cn(btnPrimary, isClosed && 'pointer-events-none opacity-50')}
                  >
                    {a.status === 'started' ? <PlayCircle className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                    {isClosed ? 'Closed' : a.status === 'started' ? 'Resume' : 'Start'}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
