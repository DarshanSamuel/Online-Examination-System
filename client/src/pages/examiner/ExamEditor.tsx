import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../lib/firebase';
import { createExam, listQuestions, normalizeExam, toLocalInput, updateExam, type ExamInput } from '../../lib/examinerData';
import { ALL_LANGUAGES, type ExamSection, type ExamSettings, type Question } from '../../types/examiner';
import type { LanguageKey } from '../../types/exam';
import { btnGhost, btnPrimary, btnSmall, card, input, label } from '../../components/ui/styles';
import { cn } from '../../lib/utils';

const DEFAULT_SETTINGS: ExamSettings = {
  shuffleOptions: true,
  allowedLanguages: ['python', 'javascript', 'cpp', 'java'],
  maxWarnings: 3,
  maxAttempts: 0,
  requireFullscreen: true,
  requireWebcam: false,
  requireMicrophone: false,
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
        const e = normalizeExam(snap.id, snap.data() as Record<string, unknown>);
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

  if (loading) return <ExaminerLayout><p className="animate-pulse text-slate-400">Loading…</p></ExaminerLayout>;

  const toggleLang = (k: LanguageKey) =>
    patchSettings('allowedLanguages', settings.allowedLanguages.includes(k) ? settings.allowedLanguages.filter((x) => x !== k) : [...settings.allowedLanguages, k]);

  return (
    <ExaminerLayout>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">{examId ? 'Edit exam' : 'New exam'}</h1>

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
            <div>
              <label className={label}>Max attempts per student (0 = unlimited until closing)</label>
              <input
                className={input}
                inputMode="numeric"
                value={settings.maxAttempts ?? 0}
                onChange={(e) => patchSettings('maxAttempts', Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label className={label}>Opens at</label>
              <input type="datetime-local" className={input} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div>
              <label className={label}>Submissions close at</label>
              <input type="datetime-local" className={input} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          <p className="mt-2.5 text-xs text-slate-500">
            Each candidate gets the duration from the moment they start, but never past the closing time. Set max attempts to <strong>0</strong> for unlimited reattempts until closing time, or enter <strong>1, 2, 3…</strong> to cap attempts.
          </p>
        </section>

        <section className={cn(card, 'p-6')}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Sections & question pools</h2>
              <p className="text-xs text-slate-500">Each candidate receives a random draw from every pool. Estimated total: <strong>{Math.round(totalPoints * 100) / 100} pts</strong></p>
            </div>
            <button className={btnSmall} onClick={() => setSections([...sections, newSection()])}>
              <Plus className="h-3.5 w-3.5" /> Add section
            </button>
          </div>
          {mixedPoints && <p className="animate-tab-enter mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">A pool mixes questions with different point values, so candidates may get different maximum scores. Set “points per question” to normalize.</p>}
          {bank.length === 0 && <p className="animate-tab-enter mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">Your question bank is empty. Add questions first.</p>}

          <div className="space-y-5">
            {sections.map((s, idx) => (
              <div key={s.id} className="animate-panel-open rounded-2xl border border-slate-200/90 bg-slate-50/40 p-5">
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
                    <button disabled={sections.length <= 1} onClick={() => setSections(sections.filter((x) => x.id !== s.id))} className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Remove section">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="accent-primary-600" checked={s.shuffleQuestions} onChange={(e) => patchSection(s.id, { shuffleQuestions: e.target.checked })} />
                  Shuffle question order for each candidate
                </label>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Pool ({s.poolQuestionIds.length} selected)</span>
                    <input className={cn(input, 'w-56 py-1.5')} placeholder="Filter…" value={poolFilter} onChange={(e) => setPoolFilter(e.target.value)} />
                  </div>
                  <div className="max-h-56 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
                    {bank
                      .filter((q) => !poolFilter || q.title.toLowerCase().includes(poolFilter.toLowerCase()))
                      .map((q) => {
                        const checked = s.poolQuestionIds.includes(q.id);
                        const usedElsewhere = sections.some((o) => o.id !== s.id && o.poolQuestionIds.includes(q.id));
                        return (
                          <label key={q.id} className={cn('flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-slate-50', checked && 'bg-primary-50/40', usedElsewhere && 'opacity-50')}>
                            <input
                              type="checkbox"
                              className="accent-primary-600"
                              checked={checked}
                              disabled={usedElsewhere}
                              onChange={() => patchSection(s.id, { poolQuestionIds: checked ? s.poolQuestionIds.filter((x) => x !== q.id) : [...s.poolQuestionIds, q.id] })}
                            />
                            <span className="flex-1 truncate font-medium text-slate-800">{q.title}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium uppercase text-slate-500">{q.type}</span>
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
          <div className="mt-4 grid gap-2.5 md:grid-cols-2">
            {(
              [
                ['requireFullscreen', 'Require fullscreen (mandatory)'],
                ['requireWebcam', 'Require webcam & snapshots (optional — check to make mandatory)'],
                ['requireMicrophone', 'Require microphone monitoring (optional — check to make mandatory)'],
                ['shuffleOptions', 'Shuffle MCQ options per candidate'],
                ['showResultsToCandidate', 'Show score to candidates after grading'],
              ] as const
            ).map(([k, text]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50">
                <input type="checkbox" className="accent-primary-600" checked={settings[k]} onChange={(e) => patchSettings(k, e.target.checked)} />
                {text}
              </label>
            ))}
          </div>
          <div className="mt-5">
            <label className={label}>Allowed programming languages</label>
            <div className="flex flex-wrap gap-2">
              {ALL_LANGUAGES.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => toggleLang(l.key)}
                  className={cn(
                    'cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                    settings.allowedLanguages.includes(l.key)
                      ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && <p className="animate-tab-enter rounded-xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}

        <div className="flex justify-end gap-2.5">
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
