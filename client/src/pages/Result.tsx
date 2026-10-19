import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Hourglass, Lock, XCircle } from 'lucide-react';
import { api, apiErrorMessage } from '../lib/api';
import { AppHeader } from '../components/ui/AppHeader';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';
import { card } from '../components/ui/styles';
import { cn } from '../lib/utils';

interface Result {
  examTitle: string;
  status: string;
  released: boolean;
  totalScore?: number;
  maxScore?: number;
  questions?: { questionId: string; type: string; score: number; maxScore: number; status: string }[];
}

const TONE: Record<string, string> = { correct: 'text-emerald-600', partial: 'text-amber-600', incorrect: 'text-red-600', unanswered: 'text-slate-400', error: 'text-red-600' };

/** Candidate outcome page. Shows the score only if the examiner chose to release results. */
export function ResultPage() {
  const { examId } = useParams<{ examId: string }>();
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!examId) return;
    let alive = true;
    const load = () =>
      api
        .get<Result>(`/attempts/exams/${examId}/result`)
        .then((r) => {
          if (!alive) return;
          setData(r.data);
          // Grading is asynchronous; keep polling until it finishes.
          if (['submitted', 'grading'].includes(r.data.status)) setTimeout(load, 4000);
        })
        .catch((e) => alive && setError(apiErrorMessage(e)));
    void load();
    return () => {
      alive = false;
    };
  }, [examId]);

  if (error) return <div className="flex min-h-screen items-center justify-center text-red-600">{error}</div>;
  if (!data) return <FullPageSpinner label="Loading result…" />;

  const grading = ['submitted', 'grading'].includes(data.status);
  const pct = data.released && data.maxScore ? Math.round(((data.totalScore ?? 0) / data.maxScore) * 100) : null;

  return (
    <div className="min-h-screen bg-transparent">
      <AppHeader />
      <main className="animate-page-enter mx-auto max-w-2xl px-6 py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> My exams
        </Link>
        <div className={cn(card, 'p-8 text-center')}>
          <p className="text-sm font-medium text-slate-500">{data.examTitle}</p>
          {grading && (
            <div className="animate-tab-enter">
              <Hourglass className="mx-auto mt-4 h-10 w-10 animate-pulse text-primary-600" />
              <h1 className="mt-3 text-xl font-bold text-slate-900">Grading in progress…</h1>
              <p className="mt-1 text-sm text-slate-500">This page updates automatically.</p>
            </div>
          )}
          {!grading && !data.released && (
            <div className="animate-tab-enter">
              <Lock className="mx-auto mt-4 h-10 w-10 text-slate-400" />
              <h1 className="mt-3 text-xl font-bold text-slate-900">Submitted</h1>
              <p className="mt-1 text-sm text-slate-500">Your examiner hasn't released scores for this exam.</p>
            </div>
          )}
          {data.released && (
            <div className="animate-tab-enter">
              <p className="mt-4 text-5xl font-bold tracking-tight text-slate-900">{pct}%</p>
              <p className="mt-1 text-slate-500">{data.totalScore} of {data.maxScore} points</p>
              <ul className="mt-6 divide-y divide-slate-100 text-left text-sm">
                {data.questions?.map((q, i) => (
                  <li key={q.questionId} className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      {q.status === 'correct' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : q.status === 'incorrect' || q.status === 'error' ? <XCircle className="h-4 w-4 text-red-600" /> : <span className="h-4 w-4" />}
                      Question {i + 1} <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] uppercase text-slate-500">{q.type}</span>
                    </span>
                    <span className={cn('font-mono font-semibold', TONE[q.status])}>{q.score}/{q.maxScore}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
