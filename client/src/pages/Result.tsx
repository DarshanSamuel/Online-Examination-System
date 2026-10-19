import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Hourglass, Lock, XCircle } from 'lucide-react';
import { api, apiErrorMessage } from '../lib/api';
import { AppHeader } from '../components/ui/AppHeader';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';
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
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> My exams
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">{data.examTitle}</p>
          {grading && (
            <>
              <Hourglass className="mx-auto mt-4 h-10 w-10 animate-pulse text-primary-600" />
              <h1 className="mt-3 text-xl font-semibold text-slate-900">Grading in progress…</h1>
              <p className="mt-1 text-sm text-slate-500">This page updates automatically.</p>
            </>
          )}
          {!grading && !data.released && (
            <>
              <Lock className="mx-auto mt-4 h-10 w-10 text-slate-400" />
              <h1 className="mt-3 text-xl font-semibold text-slate-900">Submitted</h1>
              <p className="mt-1 text-sm text-slate-500">Your examiner hasn't released scores for this exam.</p>
            </>
          )}
          {data.released && (
            <>
              <p className="mt-4 text-5xl font-semibold text-slate-900">{pct}%</p>
              <p className="mt-1 text-slate-500">{data.totalScore} of {data.maxScore} points</p>
              <ul className="mt-6 divide-y divide-slate-100 text-left text-sm">
                {data.questions?.map((q, i) => (
                  <li key={q.questionId} className="flex items-center justify-between py-2.5">
                    <span className="flex items-center gap-2">
                      {q.status === 'correct' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : q.status === 'incorrect' || q.status === 'error' ? <XCircle className="h-4 w-4 text-red-600" /> : <span className="h-4 w-4" />}
                      Question {i + 1} <span className="text-xs uppercase text-slate-400">{q.type}</span>
                    </span>
                    <span className={cn('font-mono', TONE[q.status])}>{q.score}/{q.maxScore}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
