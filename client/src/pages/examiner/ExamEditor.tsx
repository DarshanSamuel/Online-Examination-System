import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../lib/firebase';
import { createExam, listQuestions, toLocalInput, updateExam, type ExamInput } from '../../lib/examinerData';
import { ALL_LANGUAGES, type Exam, type ExamSection, type ExamSettings, type Question } from '../../types/examiner';
import type { LanguageKey } from '../../types/exam';
import { btnGhost, btnPrimary, btnSmall, card, input, label } from '../../components/ui/styles';
import { cn } from '../../lib/utils';
import { Timestamp } from 'firebase/firestore';

const DEFAULT_SETTINGS: ExamSettings = {
  shuffleOptions: true,
  allowedLanguages: ['python', 'javascript', 'cpp', 'java'],
  maxWarnings: 3,
  requireFullscreen: true,
  requireWebcam: true,
  requireMicrophone: true,
  snapshotIntervalSec: 60,
  audioThresholdDb: -20,
  gracePeriodSec: 30,
  showResultsToCandidate: false,
};

let sectionCounter = 0;
const newSection = (): ExamSection => ({ id: `s${Date.now().toString(36)}${sectionCounter++}`, title: 'Section', poolQuestionIds: [], drawCount: 1, shuffleQuestions: true, pointsPerQuestion: null });

export function ExamEditor() {
  const { examId } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bank, setBank] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [duration, setDuration] = useState('60');
  const [opensAt, setOpensAt] = useState(toLocalInput(new Date()));
  const [closesAt, setClosesAt] = useState(toLocalInput(new Date(Date.now() + 7 * 864e5)));
  const [sections, setSections] = useState<ExamSection[]>([newSection()]);
  const [settings, setSettings] = useState<ExamSettings>(DEFAULT_SETTINGS);
  const [poolFilter, setPoolFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setBank(await listQuestions(user.uid));
      if (examId) {
        const snap = await getDoc(doc(db, 'exams', examId));
        if (!snap.exists()) throw new Error('Exam not found');
        const e = { id: snap.id, ...(snap.data() as Omit<Exam, 'id'>) } as Exam;
        setTitle(e.title);
        setDescription(e.description);
        setInstructions(e.instructions);
        setDuration(String(e.durationMinutes));
        setOpensAt(toLocalInput(e.window.opensAt.toDate()));
        setClosesAt(toLocalInput(e.window.closesAt.toDate()));
        setSections(e.sections);
        setSettings({ ...DEFAULT_SETTINGS, ...e.settings });
      }
    })()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, examId]);

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const patchSection = (id: string, patch: Partial<ExamSection>) => setSections((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const patchSettings = <K extends keyof ExamSettings>(k: K, v: ExamSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const totalPoints = useMemo(
    () =>
      sections.reduce((sum, s) => {
        const pool = s.poolQuestionIds.map((id) => byId.get(id)).filter(Boolean) as Question[];
        const per = s.pointsPerQuestion ?? (pool.length ? pool.reduce((a, q) => a + q.points, 0) / pool.length : 0);
        return sum + per * s.drawCount;
      }, 0),
    [sections, byId],
  );

  const mixedPoints = sections.some((s) => {
    if (s.pointsPerQuestion != null) return false;
    const pts = new Set(s.poolQuestionIds.map((id) => byId.get(id)?.points));
    return pts.size > 1;
  });

  const save = async () => {
    setError(null);
    if (!user) return;
    const dur = Number(duration);
    const opens = new Date(opensAt);
    const closes = new Date(closesAt);
    if (!title.trim()) return setError('Title is required.');
    if (!(dur > 0 && dur <= 600)) return setError('Duration must be between 1 and 600 minutes.');
    if (!(closes > opens)) return setError('The window must close after it opens.');
    if (!sections.length) return setError('Add at least one section.');
    for (const s of sections) {
      if (!s.title.trim()) return setError('Every section needs a title.');
      if (s.poolQuestionIds.length === 0) return setError(`Section “${s.title}” has no questions in its pool.`);
      if (!(s.drawCount >= 1 && s.drawCount <= s.poolQuestionIds.length)) return setError(`Section “${s.title}”: draw count must be between 1 and the pool size (${s.poolQuestionIds.length}).`);
    }
    const hasCoding = sections.some((s) => s.poolQuestionIds.some((id) => byId.get(id)?.type === 'coding'));
    if (hasCoding && settings.allowedLanguages.length === 0) return setError('Select at least one allowed language.');

    const payload: ExamInput = {
      title: title.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      durationMinutes: dur,
      window: { opensAt: Timestamp.fromDate(opens), closesAt: Timestamp.fromDate(closes) },
      sections,
      settings,
      totalPoints: Math.round(totalPoints * 100) / 100,
    };

    setSaving(true);
    try {
      const id = examId ?? (await createExam(user.uid, payload));
      if (examId) await updateExam(examId, payload);
      navigate(`/examiner/exams/${id}`);
    } catch (e) {
      setError((e as Error).message || 'Failed to save');
      setSaving(false);
    }
  };

  if (loading) return <ExaminerLayout><p className="text-slate-400">Loading…</p></ExaminerLayout>;

  const toggleLang = (k: LanguageKey) =>
    patchSettings('allowedLanguages', settings.allowedLanguages.includes(k) ? settings.allowedLanguages.filter((x) => x !== k) : [...settings.allowedLanguages, k]);

  return (
    <ExaminerLayout>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">{examId ? 'Edit exam' : 'New exam'}</h1>

      <div className="space-y-6">
        <section className={cn(card, 'p-6')}>
          <h2 className="mb-4 font-semibold text-slate-900">Basics</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={label}>Title</label>
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Description</label>
              <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Instructions (shown in the lobby)</label>
              <textarea className={cn(input, 'min-h-24')} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </div>
            <div>
              <label className={label}>Duration (minutes)</label>
              <input className={input} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div />
            <div>
              <label className={label}>Opens at</label>
              <input type="datetime-local" className={input} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div>
              <label className={label}>Closes at</label>
              <input type="datetime-local" className={input} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Each candidate gets the duration from the moment they start, but never past the closing time.</p>
        </section>

        <section className={cn(card, 'p-6')}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Sections & question pools</h2>
              <p className="text-xs text-slate-500">Each candidate receives a random draw from every pool. Estimated total: <strong>{Math.round(totalPoints * 100) / 100} pts</strong></p>
            </div>
            <button className={btnSmall} onClick={() => setSections([...sections, newSection()])}>
              <Plus className="h-3 w-3" /> Add section
            </button>
          </div>
          {mixedPoints && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">A pool mixes questions with different point values, so candidates may get different maximum scores. Set “points per question” to normalize.</p>}
          {bank.length === 0 && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Your question bank is empty. Add questions first.</p>}

          <div className="space-y-5">
            {sections.map((s, idx) => (
              <div key={s.id} className="rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto]">
                  <div>
                    <label className={label}>Section title</label>
                    <input className={input} value={s.title} onChange={(e) => patchSection(s.id, { title: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>Draw count</label>
                    <input className={input} inputMode="numeric" value={s.drawCount} onChange={(e) => patchSection(s.id, { drawCount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                  </div>
                  <div>
                    <label className={label}>Points / question</label>
                    <input className={input} inputMode="decimal" placeholder="own points" value={s.pointsPerQuestion ?? ''} onChange={(e) => patchSection(s.id, { pointsPerQuestion: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                  <div className="flex items-end">
                    <button disabled={sections.length <= 1} onClick={() => setSections(sections.filter((x) => x.id !== s.id))} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30" title="Remove section">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="accent-primary-600" checked={s.shuffleQuestions} onChange={(e) => patchSection(s.id, { shuffleQuestions: e.target.checked })} />
                  Shuffle question order for each candidate
                </label>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Pool ({s.poolQuestionIds.length} selected)</span>
                    <input className={cn(input, 'w-56 py-1')} placeholder="Filter…" value={poolFilter} onChange={(e) => setPoolFilter(e.target.value)} />
                  </div>
                  <div className="max-h-56 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
                    {bank
                      .filter((q) => !poolFilter || q.title.toLowerCase().includes(poolFilter.toLowerCase()))
                      .map((q) => {
                        const checked = s.poolQuestionIds.includes(q.id);
                        const usedElsewhere = sections.some((o) => o.id !== s.id && o.poolQuestionIds.includes(q.id));
                        return (
                          <label key={q.id} className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50', usedElsewhere && 'opacity-50')}>
                            <input
                              type="checkbox"
                              className="accent-primary-600"
                              checked={checked}
                              disabled={usedElsewhere}
                              onChange={() => patchSection(s.id, { poolQuestionIds: checked ? s.poolQuestionIds.filter((x) => x !== q.id) : [...s.poolQuestionIds, q.id] })}
                            />
                            <span className="flex-1 truncate">{q.title}</span>
                            <span className="text-xs uppercase text-slate-400">{q.type}</span>
                            <span className="w-14 text-right text-xs text-slate-500">{q.points} pts</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
                {idx === 0 && sections.length > 1 && <p className="mt-2 text-xs text-slate-400">A question can only belong to one section.</p>}
              </div>
            ))}
          </div>
        </section>

        <section className={cn(card, 'p-6')}>
          <h2 className="mb-4 font-semibold text-slate-900">Proctoring & rules</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={label}>Max warnings before auto-submit</label>
              <input className={input} inputMode="numeric" value={settings.maxWarnings} onChange={(e) => patchSettings('maxWarnings', Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
              <p className="mt-1 text-xs text-slate-500">0 disables auto-submit.</p>
            </div>
            <div>
              <label className={label}>Snapshot interval (seconds)</label>
              <input className={input} inputMode="numeric" value={settings.snapshotIntervalSec} onChange={(e) => patchSettings('snapshotIntervalSec', Math.max(15, Math.floor(Number(e.target.value) || 60)))} />
            </div>
            <div>
              <label className={label}>Audio threshold (dBFS)</label>
              <input className={input} inputMode="numeric" value={settings.audioThresholdDb} onChange={(e) => patchSettings('audioThresholdDb', Number(e.target.value) || -20)} />
              <p className="mt-1 text-xs text-slate-500">Closer to 0 = less sensitive.</p>
            </div>
            <div>
              <label className={label}>Late-save grace (seconds)</label>
              <input className={input} inputMode="numeric" value={settings.gracePeriodSec} onChange={(e) => patchSettings('gracePeriodSec', Math.min(300, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(
              [
                ['requireFullscreen', 'Require fullscreen'],
                ['requireWebcam', 'Require webcam & snapshots'],
                ['requireMicrophone', 'Require microphone monitoring'],
                ['shuffleOptions', 'Shuffle MCQ options per candidate'],
                ['showResultsToCandidate', 'Show score to candidates after grading'],
              ] as const
            ).map(([k, text]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-primary-600" checked={settings[k]} onChange={(e) => patchSettings(k, e.target.checked)} />
                {text}
              </label>
            ))}
          </div>
          <div className="mt-5">
            <label className={label}>Allowed programming languages</label>
            <div className="flex flex-wrap gap-2">
              {ALL_LANGUAGES.map((l) => (
                <button key={l.key} type="button" onClick={() => toggleLang(l.key)} className={cn('rounded-full border px-3 py-1 text-sm', settings.allowedLanguages.includes(l.key) ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-300 text-slate-500')}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={() => navigate(examId ? `/examiner/exams/${examId}` : '/examiner')} disabled={saving}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {examId ? 'Save changes' : 'Create draft'}
          </button>
        </div>
      </div>
    </ExaminerLayout>
  );
}
