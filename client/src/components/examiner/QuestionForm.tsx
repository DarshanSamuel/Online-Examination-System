import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { saveQuestion } from '../../lib/examinerData';
import { ALL_LANGUAGES, type AnswerKey, type ComparisonMode, type Difficulty, type Question, type QuestionInput, type TestCase } from '../../types/examiner';
import type { LanguageKey } from '../../types/exam';
import { btnGhost, btnPrimary, btnSmall, card, input, label } from '../ui/styles';
import { cn } from '../../lib/utils';

interface Props {
  initial?: { question: Question; key: AnswerKey };
  /** Bank to place the new question in (ignored when editing). */
  bankId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

type TC = { input: string; expectedOutput: string; weight: string; explanation: string };
const blankTc = (): TC => ({ input: '', expectedOutput: '', weight: '1', explanation: '' });
const toTc = (t: TestCase): TC => ({ input: t.input, expectedOutput: t.expectedOutput, weight: String(t.weight), explanation: t.explanation ?? '' });

export function QuestionForm({ initial, bankId = 'default', onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const q = initial?.question;
  const k = initial?.key;
  const editing = !!q;

  const [type, setType] = useState<Question['type']>(q?.type ?? 'mcq');
  const [title, setTitle] = useState(q?.title ?? '');
  const [prompt, setPrompt] = useState(q?.prompt ?? '');
  const [points, setPoints] = useState(String(q?.points ?? 1));
  const [difficulty, setDifficulty] = useState<Difficulty>(q?.difficulty ?? 'easy');
  const [tags, setTags] = useState(q?.tags.join(', ') ?? '');

  // MCQ
  const [options, setOptions] = useState(q?.type === 'mcq' ? q.options.map((o) => ({ ...o })) : [{ id: 'o1', text: '' }, { id: 'o2', text: '' }]);
  const [correctId, setCorrectId] = useState(k?.type === 'mcq' ? k.correctOptionId : '');

  // Numerical
  const [numValue, setNumValue] = useState(k?.type === 'numerical' ? String(k.value) : '');
  const [tolMode, setTolMode] = useState<'absolute' | 'relative'>(k?.type === 'numerical' ? k.tolerance.mode : 'absolute');
  const [tolAmount, setTolAmount] = useState(k?.type === 'numerical' ? String(k.tolerance.amount) : '0');
  const [unit, setUnit] = useState(q?.type === 'numerical' ? q.unit ?? '' : '');

  // Coding
  const [starter, setStarter] = useState<Partial<Record<LanguageKey, string>>>(q?.type === 'coding' ? q.starterCode : {});
  const [starterLang, setStarterLang] = useState<LanguageKey>('python');
  const [publicTests, setPublicTests] = useState<TC[]>(q?.type === 'coding' ? q.publicTestCases.map(toTc) : [blankTc()]);
  const [hiddenTests, setHiddenTests] = useState<TC[]>(k?.type === 'coding' ? k.hiddenTestCases.map(toTc) : [blankTc()]);
  const [cpu, setCpu] = useState(q?.type === 'coding' ? String(q.limits.cpuTimeSec) : '2');
  const [memMb, setMemMb] = useState(q?.type === 'coding' ? String(Math.round(q.limits.memoryKb / 1024)) : '128');
  const [comparison, setComparison] = useState<ComparisonMode>(q?.type === 'coding' ? q.comparison : 'trimmed');
  const [floatTol, setFloatTol] = useState(q?.type === 'coding' && q.floatTolerance != null ? String(q.floatTolerance) : '1e-6');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

  const buildTests = (rows: TC[], prefix: string, withExplanation: boolean): TestCase[] =>
    rows.map((r, i) => ({
      id: `${prefix}${i + 1}`,
      input: r.input,
      expectedOutput: r.expectedOutput,
      weight: num(r.weight),
      ...(withExplanation && r.explanation.trim() ? { explanation: r.explanation.trim() } : {}),
    }));

  const save = async () => {
    setError(null);
    if (!user) return;
    const pts = num(points);
    if (!title.trim() || !prompt.trim()) return setError('Title and prompt are required.');
    if (!(pts > 0)) return setError('Points must be greater than 0.');

    const base = { title: title.trim(), prompt: prompt.trim(), points: pts, difficulty, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
    let input: QuestionInput;
    let key: AnswerKey;

    if (type === 'mcq') {
      const filled = options.filter((o) => o.text.trim());
      if (filled.length < 2) return setError('Add at least two non-empty options.');
      if (!filled.some((o) => o.id === correctId)) return setError('Mark the correct option.');
      input = { ...base, type: 'mcq', options: filled.map((o) => ({ id: o.id, text: o.text.trim() })) };
      key = { type: 'mcq', correctOptionId: correctId };
    } else if (type === 'numerical') {
      const v = num(numValue);
      const t = num(tolAmount);
      if (!Number.isFinite(v)) return setError('Correct value must be a number.');
      if (!Number.isFinite(t) || t < 0) return setError('Tolerance must be 0 or greater.');
      input = { ...base, type: 'numerical', unit: unit.trim() || null };
      key = { type: 'numerical', value: v, tolerance: { mode: tolMode, amount: t } };
    } else {
      const pub = buildTests(publicTests, 'p', true);
      const hid = buildTests(hiddenTests, 'h', false);
      if (!pub.length || !hid.length) return setError('Add at least one public and one hidden test case.');
      if ([...pub, ...hid].some((t) => !(t.weight > 0))) return setError('Test case weights must be greater than 0.');
      const cpuSec = num(cpu);
      const mem = num(memMb);
      if (!(cpuSec > 0) || !(mem > 0)) return setError('CPU and memory limits must be positive.');
      input = {
        ...base,
        type: 'coding',
        starterCode: Object.fromEntries(Object.entries(starter).filter(([, v]) => v?.trim())) as Partial<Record<LanguageKey, string>>,
        publicTestCases: pub,
        limits: { cpuTimeSec: cpuSec, memoryKb: Math.round(mem * 1024) },
        comparison,
        ...(comparison === 'float' ? { floatTolerance: num(floatTol) } : {}),
      };
      key = { type: 'coding', hiddenTestCases: hid };
    }

    setSaving(true);
    try {
      await saveQuestion(user.uid, input, key, q?.id, bankId);
      onSaved();
    } catch (e) {
      setError((e as Error).message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className={cn(card, 'p-6')}>
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className={label}>Type</label>
          <select className={input} value={type} disabled={editing} onChange={(e) => setType(e.target.value as Question['type'])}>
            <option value="mcq">Multiple choice</option>
            <option value="numerical">Numerical</option>
            <option value="coding">Coding</option>
          </select>
        </div>
        <div>
          <label className={label}>Points</label>
          <input className={input} inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>
        <div>
          <label className={label}>Difficulty</label>
          <select className={input} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className={label}>Tags (comma separated)</label>
          <input className={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="arrays, dp" />
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Title</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="mt-4">
        <label className={label}>Prompt</label>
        <textarea className={cn(input, 'min-h-28 font-mono')} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>

      <div key={type} className="animate-tab-enter">
        {type === 'mcq' && (
          <div className="mt-6">
            <label className={label}>Options (select the correct one)</label>
            <div className="space-y-2.5">
              {options.map((o, i) => (
                <div key={o.id} className="animate-tab-enter flex items-center gap-2.5">
                  <input type="radio" name="correct" checked={correctId === o.id} onChange={() => setCorrectId(o.id)} className="h-4 w-4 cursor-pointer accent-emerald-600" />
                  <input className={input} value={o.text} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={(e) => setOptions(options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))} />
                  <button
                    type="button"
                    disabled={options.length <= 2}
                    onClick={() => {
                      setOptions(options.filter((x) => x.id !== o.id));
                      if (correctId === o.id) setCorrectId('');
                    }}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={cn(btnSmall, 'mt-3')}
              onClick={() => setOptions([...options, { id: `o${Math.max(0, ...options.map((o) => Number(o.id.slice(1)) || 0)) + 1}`, text: '' }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add option
            </button>
          </div>
        )}

        {type === 'numerical' && (
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div>
              <label className={label}>Correct value</label>
              <input className={input} inputMode="decimal" value={numValue} onChange={(e) => setNumValue(e.target.value)} />
            </div>
            <div>
              <label className={label}>Tolerance type</label>
              <select className={input} value={tolMode} onChange={(e) => setTolMode(e.target.value as 'absolute' | 'relative')}>
                <option value="absolute">Absolute (± amount)</option>
                <option value="relative">Relative (± fraction)</option>
              </select>
            </div>
            <div>
              <label className={label}>{tolMode === 'relative' ? 'Fraction (0.01 = 1%)' : 'Amount'}</label>
              <input className={input} inputMode="decimal" value={tolAmount} onChange={(e) => setTolAmount(e.target.value)} />
            </div>
            <div>
              <label className={label}>Unit (optional)</label>
              <input className={input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m/s" />
            </div>
          </div>
        )}

        {type === 'coding' && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className={label}>Output comparison</label>
                <select className={input} value={comparison} onChange={(e) => setComparison(e.target.value as ComparisonMode)}>
                  <option value="trimmed">Trimmed (ignore trailing whitespace)</option>
                  <option value="exact">Exact</option>
                  <option value="tokens">Tokens (ignore all whitespace)</option>
                  <option value="float">Float tolerance</option>
                </select>
              </div>
              {comparison === 'float' && (
                <div className="animate-tab-enter">
                  <label className={label}>Float tolerance</label>
                  <input className={input} value={floatTol} onChange={(e) => setFloatTol(e.target.value)} />
                </div>
              )}
              <div>
                <label className={label}>CPU limit (s)</label>
                <input className={input} value={cpu} onChange={(e) => setCpu(e.target.value)} />
              </div>
              <div>
                <label className={label}>Memory (MB)</label>
                <input className={input} value={memMb} onChange={(e) => setMemMb(e.target.value)} />
              </div>
            </div>

            <div>
              <label className={label}>Starter code (optional)</label>
              <div className="mb-2.5 inline-flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1">
                {ALL_LANGUAGES.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => setStarterLang(l.key)}
                    className={cn(
                      'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-95',
                      starterLang === l.key ? 'bg-primary-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900',
                    )}
                  >
                    {l.label}
                    {starter[l.key]?.trim() ? ' •' : ''}
                  </button>
                ))}
              </div>
              <textarea
                key={starterLang}
                className={cn(input, 'animate-tab-enter min-h-32 font-mono')}
                value={starter[starterLang] ?? ''}
                onChange={(e) => setStarter({ ...starter, [starterLang]: e.target.value })}
                spellCheck={false}
              />
            </div>

            <TestEditor title="Public test cases (shown to candidates, used by “Run”)" tests={publicTests} setTests={setPublicTests} withExplanation />
            <TestEditor title="Hidden test cases (used only for final grading)" tests={hiddenTests} setTests={setHiddenTests} />
          </div>
        )}
      </div>

      {error && <p className="animate-tab-enter mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}

      <div className="mt-6 flex justify-end gap-2.5 border-t border-slate-100 pt-5">
        <button className={btnGhost} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className={btnPrimary} onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save changes' : 'Create question'}
        </button>
      </div>
    </div>
  );
}

function TestEditor({ title, tests, setTests, withExplanation }: { title: string; tests: TC[]; setTests: (t: TC[]) => void; withExplanation?: boolean }) {
  const update = (i: number, patch: Partial<TC>) => setTests(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <label className={cn(label, 'mb-0')}>{title}</label>
        <button type="button" className={btnSmall} onClick={() => setTests([...tests, blankTc()])}>
          <Plus className="h-3.5 w-3.5" /> Add test
        </button>
      </div>
      <div className="space-y-3">
        {tests.map((t, i) => (
          <div key={i} className="animate-tab-enter rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition-colors hover:border-slate-300">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_90px_auto]">
              <textarea className={cn(input, 'min-h-16 font-mono')} placeholder="stdin" value={t.input} onChange={(e) => update(i, { input: e.target.value })} spellCheck={false} />
              <textarea className={cn(input, 'min-h-16 font-mono')} placeholder="expected stdout" value={t.expectedOutput} onChange={(e) => update(i, { expectedOutput: e.target.value })} spellCheck={false} />
              <input className={input} title="Weight" placeholder="weight" value={t.weight} onChange={(e) => update(i, { weight: e.target.value })} />
              <button
                type="button"
                disabled={tests.length <= 1}
                onClick={() => setTests(tests.filter((_, j) => j !== i))}
                className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {withExplanation && <input className={cn(input, 'mt-2.5')} placeholder="Explanation (optional, shown to candidate)" value={t.explanation} onChange={(e) => update(i, { explanation: e.target.value })} />}
          </div>
        ))}
      </div>
    </div>
  );
}
