import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { QuestionForm } from '../../components/examiner/QuestionForm';
import { useAuth } from '../../auth/AuthProvider';
import { deleteQuestion, examsUsingQuestion, listQuestions, loadQuestion } from '../../lib/examinerData';
import type { AnswerKey, Question } from '../../types/examiner';
import { btnGhost, btnPrimary, btnSmall, card, input } from '../../components/ui/styles';
import { cn } from '../../lib/utils';

const TYPE_LABEL = { mcq: 'MCQ', numerical: 'Numerical', coding: 'Coding' } as const;
const DIFF_TONE = {
  easy: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  medium: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  hard: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
} as const;

export function QuestionBank() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Question['type']>('all');
  const [editor, setEditor] = useState<null | { question: Question; key: AnswerKey } | 'new'>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setQuestions(await listQuestions(user.uid));
    } catch {
      setError('Could not load questions.');
    }
  }, [user]);

  useEffect(() => void refresh(), [refresh]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (questions ?? []).filter((q) => (typeFilter === 'all' || q.type === typeFilter) && (!s || q.title.toLowerCase().includes(s) || q.tags.some((t) => t.toLowerCase().includes(s))));
  }, [questions, search, typeFilter]);

  const edit = async (id: string) => {
    try {
      setEditor(await loadQuestion(id));
    } catch {
      setError('Could not load that question.');
    }
  };

  const remove = async (q: Question) => {
    if (!user) return;
    const used = await examsUsingQuestion(user.uid, q.id);
    if (used.length) return alert(`This question is used by: ${used.join(', ')}.\nRemove it from those exams first.`);
    if (!confirm(`Delete “${q.title}”? This cannot be undone.`)) return;
    await deleteQuestion(q.id);
    void refresh();
  };

  return (
    <ExaminerLayout>
      {editor ? (
        <div key={editor === 'new' ? 'new' : editor.question.id} className="animate-panel-open">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{editor === 'new' ? 'New question' : 'Edit question'}</h1>
              <p className="mt-0.5 text-sm text-slate-500">Configure the prompt, grading rules and answer key.</p>
            </div>
            <button className={btnGhost} onClick={() => setEditor(null)}>
              <ArrowLeft className="h-4 w-4" /> Back to bank
            </button>
          </div>
          <QuestionForm
            initial={editor === 'new' ? undefined : editor}
            onCancel={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              void refresh();
            }}
          />
        </div>
      ) : (
        <div key="list" className="animate-tab-enter">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Question bank</h1>
              <p className="mt-0.5 text-sm text-slate-500">Questions you create here can be pooled into exams.</p>
            </div>
            <button className={btnPrimary} onClick={() => setEditor('new')}>
              <Plus className="h-4 w-4" /> New question
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input className={cn(input, 'pl-10')} placeholder="Search title or tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100/80 p-1">
              {(['all', 'mcq', 'numerical', 'coding'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-95',
                    typeFilter === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {t === 'all' ? 'All types' : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="mt-4 text-red-600">{error}</p>}
          {questions === null && !error && <p className="mt-6 animate-pulse text-slate-400">Loading…</p>}

          <div className={cn(card, 'mt-5 divide-y divide-slate-100 overflow-hidden')}>
            {filtered.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-slate-50/80">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{q.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 ring-1 ring-inset ring-slate-200/80">{TYPE_LABEL[q.type]}</span>
                    <span className={cn('rounded-md px-2 py-0.5 font-medium capitalize', DIFF_TONE[q.difficulty])}>{q.difficulty}</span>
                    <span className="text-slate-500">{q.points} pts · v{q.version}</span>
                    {q.tags.map((t) => (
                      <span key={t} className="rounded bg-primary-50/70 px-1.5 py-0.5 text-primary-600">#{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className={btnSmall} onClick={() => edit(q.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button className={cn(btnSmall, 'text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700')} onClick={() => remove(q)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {questions && filtered.length === 0 && <p className="px-5 py-12 text-center text-slate-400">No questions found.</p>}
          </div>
        </div>
      )}
    </ExaminerLayout>
  );
}
