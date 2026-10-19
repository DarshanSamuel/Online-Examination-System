import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { api, apiErrorMessage } from '../lib/api';
import { SystemCheck } from '../components/Lobby/SystemCheck';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';
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
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!examId) return;
    getDoc(doc(db, 'exams', examId))
      .then((snap) => (snap.exists() ? setExam(snap.data() as ExamInfo) : setError('Exam not found')))
      .catch(() => setError('You do not have access to this exam.'));
  }, [examId]);

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
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> My exams
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{exam.title}</h1>
              <p className="mt-1 text-slate-600">{exam.description}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              <Clock className="h-4 w-4" /> {exam.durationMinutes} min
            </span>
          </div>

          {exam.instructions && (
            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{exam.instructions}</div>
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

          <label className="mt-8 flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-600" />
            <span>
              I understand that this exam is proctored: tab switches, leaving fullscreen, clipboard use and background audio are logged,
              webcam snapshots are taken, and my code editing is recorded. After {exam.settings.maxWarnings} warnings the exam is
              submitted automatically.
            </span>
          </label>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            onClick={start}
            disabled={!ready || !agreed || starting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {starting && <Loader2 className="h-4 w-4 animate-spin" />}
            {ready ? (agreed ? 'Start exam' : 'Accept the terms to continue') : 'Complete the system check to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
