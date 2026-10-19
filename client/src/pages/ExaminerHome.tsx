import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Clock, Plus } from 'lucide-react';
import { ExaminerLayout } from '../components/examiner/ExaminerLayout';
import { useAuth } from '../auth/AuthProvider';
import { listExams } from '../lib/examinerData';
import type { Exam } from '../types/examiner';
import { btnPrimary, card, statusTone } from '../components/ui/styles';
import { cn } from '../lib/utils';

export function ExaminerHome() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listExams(user.uid).then(setExams).catch(() => setError('Could not load exams.'));
  }, [user]);

  return (
    <ExaminerLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Exams</h1>
          <p className="text-sm text-slate-500">Create, publish and monitor your assessments.</p>
        </div>
        <Link to="/examiner/exams/new" className={btnPrimary}>
          <Plus className="h-4 w-4" /> New exam
        </Link>
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {exams === null && !error && <p className="mt-6 text-slate-400">Loading…</p>}
      {exams?.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
          No exams yet. Add questions to your <Link className="text-primary-600 underline" to="/examiner/questions">question bank</Link>, then create an exam.
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {exams?.map((e) => (
          <Link key={e.id} to={`/examiner/exams/${e.id}`} className={cn(card, 'p-5 transition hover:border-primary-300 hover:shadow')}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-slate-900">{e.title}</h2>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', statusTone[e.status])}>{e.status}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{e.description || 'No description'}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {e.durationMinutes} min</span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" /> {e.window.opensAt.toDate().toLocaleString()} → {e.window.closesAt.toDate().toLocaleString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </ExaminerLayout>
  );
}
