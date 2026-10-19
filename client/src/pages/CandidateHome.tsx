import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, ClipboardList, PlayCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import type { AssignmentDoc } from '../types/exam';
import { AppHeader } from '../components/ui/AppHeader';
import { btnPrimary, card, statusTone } from '../components/ui/styles';
import { cn } from '../lib/utils';

/** Candidate home: live list of assigned exams (Firestore rules restrict to the user's own email). */
export function CandidateHome() {
  const { user } = useAuth();
  const [items, setItems] = useState<(AssignmentDoc & { id: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, 'assignments'), where('candidateEmail', '==', user.email.toLowerCase()));
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AssignmentDoc) }))),
      () => setError('Could not load your exams.'),
    );
  }, [user?.email]);

  return (
    <div className="min-h-screen bg-transparent">
      <AppHeader />
      <main className="animate-page-enter mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My exams</h1>
        <p className="mt-1 text-sm text-slate-500">Exams assigned to {user?.email}</p>

        {error && <p className="mt-6 text-red-600">{error}</p>}
        {items === null && !error && <p className="mt-6 animate-pulse text-slate-400">Loading…</p>}
        {items?.length === 0 && (
          <div className="animate-tab-enter mt-10 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-500">
            <ClipboardList className="mb-3 h-8 w-8 text-slate-400" />
            No exams assigned yet.
          </div>
        )}

        <ul className="mt-6 space-y-3.5">
          {items?.map((a) => (
            <li
              key={a.id}
              className={cn(
                card,
                'flex items-center justify-between p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/90 hover:shadow-md',
              )}
            >
              <div>
                <p className="font-semibold text-slate-900">{a.examTitle}</p>
                <span className={cn('mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', statusTone[a.status])}>
                  {a.status}
                </span>
              </div>
              {a.status === 'submitted' ? (
                <Link
                  to={`/exam/${a.examId}/result`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100/80 active:scale-95"
                >
                  <CheckCircle2 className="h-4 w-4" /> Submitted · view result
                </Link>
              ) : (
                <Link to={`/exam/${a.examId}/lobby`} className={btnPrimary}>
                  {a.status === 'started' ? <PlayCircle className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  {a.status === 'started' ? 'Resume' : 'Start'}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
