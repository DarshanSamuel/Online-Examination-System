import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../lib/firebase';
import { api, apiErrorMessage } from '../lib/api';
import { SystemCheck } from '../components/Lobby/SystemCheck';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { btnPrimary, card } from '../components/ui/styles';
import { cn } from '../lib/utils';
import type { StartResult } from '../types/exam';

interface ExamInfo {
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  settings: { requireWebcam: boolean; requireMicrophone: boolean; requireFullscreen: boolean; maxWarnings: number };
}

/**
 * Pre-exam lobby. Exam metadata is read straight from Firestore (rules allow it only for
 * published exams the candidate is assigned to). Starting goes through the API, which owns
 * the clock and the randomized question draw.
 */
export function ExamLobby() {
  const { examId } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!examId || !user?.email) return;
    const email = user.email.toLowerCase();
    const asgRef = doc(db, 'assignments', `${examId}_${email}`);

    Promise.all([
      getDoc(doc(db, 'exams', examId)),
      getDoc(asgRef),
    ])
      .then(([examSnap, asgSnap]) => {
        if (!examSnap.exists()) {
          setError('Exam not found');
          return;
        }
        if (!asgSnap.exists()) {
          setError('You are not registered or admitted for this exam.');
          return;
        }
        const data = examSnap.data() as ExamInfo & { status?: string };
        if (data.status !== 'published') {
          setError('This exam is not published.');
          return;
        }
        setExam(data);
      })
      .catch(() => setError('You do not have access to this exam.'));
  }, [examId, user?.email]);

  const onReadyChange = useCallback((r: boolean) => setReady(r), []);

  const start = async () => {
    if (!examId || !exam) return;
    setStarting(true);
    setError(null);
    try {
      // Must be called directly from the click handler (user gesture) or browsers refuse.
      if (exam.settings.requireFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
      const { data } = await api.post<StartResult>(`/attempts/exams/${examId}/start`);
      if (!data.resumed) {
        try {
          localStorage.removeItem(`exam:${data.submissionId}:v1`);
        } catch {
          /* ignore */
        }
      }
      navigate(`/attempt/${data.submissionId}`, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
      if (document.fullscreenElement) void document.exitFullscreen();
      setStarting(false);
    }
  };

  if (error && !exam) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-600">{error}</p>
        <Link to="/" className="text-sm text-primary-600 hover:underline">Back to my exams</Link>
      </div>
    );
  }
  if (!exam) return <FullPageSpinner label="Loading exam…" />;

  return (
    <div className="min-h-screen bg-transparent px-6 py-10">
      <div className="animate-page-enter mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> My exams
          </Link>
          <ThemeToggle />
        </div>

        <div className={cn(card, 'p-8')}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{exam.title}</h1>
              <p className="mt-1 text-slate-600">{exam.description}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3.5 py-1 text-sm font-medium text-primary-700 ring-1 ring-inset ring-primary-200">
              <Clock className="h-4 w-4" /> {exam.durationMinutes} min
            </span>
          </div>

          {exam.instructions && (
            <div className="mt-6 rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{exam.instructions}</div>
          )}

          <h2 className="mb-4 mt-8 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-primary-600" /> System check
          </h2>
          <SystemCheck
            requireWebcam={exam.settings.requireWebcam}
            requireMicrophone={exam.settings.requireMicrophone}
            requireFullscreen={exam.settings.requireFullscreen}
            onReadyChange={onReadyChange}
          />

          <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 text-sm text-slate-700 transition-colors hover:bg-slate-50">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-600" />
            <span>
              I understand that this exam is proctored: tab switches, leaving fullscreen, clipboard use and background audio are logged,
              webcam snapshots are taken, and my code editing is recorded. After {exam.settings.maxWarnings} warnings the exam is
              submitted automatically.
            </span>
          </label>

          {error && <p className="animate-tab-enter mt-4 text-sm text-red-600">{error}</p>}

          <button
            onClick={start}
            disabled={!ready || !agreed || starting}
            className={cn(btnPrimary, 'mt-6 w-full py-3.5 text-base font-semibold')}
          >
            {starting && <Loader2 className="h-4 w-4 animate-spin" />}
            {ready ? (agreed ? 'Start exam' : 'Accept the terms to continue') : 'Complete the system check to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
