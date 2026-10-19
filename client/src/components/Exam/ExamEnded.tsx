import { CheckCircle2, Clock, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';

const COPY: Record<string, { icon: typeof CheckCircle2; title: string; body: string; tone: string }> = {
  manual: { icon: CheckCircle2, title: 'Exam submitted', body: 'Your answers were received and are being graded.', tone: 'text-emerald-600 bg-emerald-50' },
  timeout: { icon: Clock, title: "Time's up", body: 'Your exam was submitted automatically when the timer ended.', tone: 'text-amber-600 bg-amber-50' },
  max_warnings: { icon: ShieldX, title: 'Exam ended', body: 'The exam was submitted automatically because the warning limit was reached.', tone: 'text-red-600 bg-red-50' },
  examiner_terminated: { icon: ShieldX, title: 'Exam ended by examiner', body: 'Your examiner has closed this attempt.', tone: 'text-red-600 bg-red-50' },
};

export function ExamEnded({ reason, title }: { reason: string | null; title: string }) {
  const c = COPY[reason ?? 'manual'] ?? COPY.manual!;
  const Icon = c.icon;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${c.tone}`}>
          <Icon className="h-7 w-7" />
        </div>
        {title && <p className="text-sm text-slate-500">{title}</p>}
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{c.title}</h1>
        <p className="mt-2 text-slate-600">{c.body}</p>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Back to my exams
        </Link>
      </div>
    </div>
  );
}
