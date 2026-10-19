import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, ClipboardList, PlayCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import type { AssignmentDoc } from '../types/exam';
import { AppHeader } from '../components/ui/AppHeader';

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
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">My exams</h1>
        <p className="mt-1 text-sm text-slate-500">Exams assigned to {user?.email}</p>

        {error && <p className="mt-6 text-red-600">{error}</p>}
        {items === null && !error && <p className="mt-6 text-slate-400">Loading…</p>}
        {items?.length === 0 && (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
            <ClipboardList className="mb-3 h-8 w-8" />
            No exams assigned yet.
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {items?.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="font-medium text-slate-900">{a.examTitle}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">{a.status}</p>
              </div>
              {a.status === 'submitted' ? (
                <Link to={`/exam/${a.examId}/result`} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:underline">
                  <CheckCircle2 className="h-4 w-4" /> Submitted · view result
                </Link>
              ) : (
                <Link
                  to={`/exam/${a.examId}/lobby`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
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
