import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { QuestionForm } from '../../components/examiner/QuestionForm';
import { useAuth } from '../../auth/AuthProvider';
import { deleteQuestion, examsUsingQuestion, listQuestions, loadQuestion } from '../../lib/examinerData';
import type { AnswerKey, Question } from '../../types/examiner';
import { btnPrimary, btnSmall, card, input } from '../../components/ui/styles';
import { cn } from '../../lib/utils';

const TYPE_LABEL = { mcq: 'MCQ', numerical: 'Numerical', coding: 'Coding' } as const;
const DIFF_TONE = { easy: 'bg-emerald-100 text-emerald-800', medium: 'bg-amber-100 text-amber-800', hard: 'bg-red-100 text-red-800' } as const;

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
        <>
          <h1 className="mb-4 text-xl font-semibold text-slate-900">{editor === 'new' ? 'New question' : 'Edit question'}</h1>
          <QuestionForm
            initial={editor === 'new' ? undefined : editor}
            onCancel={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              void refresh();
            }}
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Question bank</h1>
              <p className="text-sm text-slate-500">Questions you create here can be pooled into exams.</p>
            </div>
            <button className={btnPrimary} onClick={() => setEditor('new')}>
              <Plus className="h-4 w-4" /> New question
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className={cn(input, 'pl-9')} placeholder="Search title or tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={cn(input, 'w-44')} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
              <option value="all">All types</option>
              <option value="mcq">MCQ</option>
              <option value="numerical">Numerical</option>
              <option value="coding">Coding</option>
            </select>
          </div>

          {error && <p className="mt-4 text-red-600">{error}</p>}
          {questions === null && !error && <p className="mt-6 text-slate-400">Loading…</p>}

          <div className={cn(card, 'mt-4 divide-y divide-slate-100')}>
            {filtered.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{q.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{TYPE_LABEL[q.type]}</span>
                    <span className={cn('rounded px-1.5 py-0.5 font-medium', DIFF_TONE[q.difficulty])}>{q.difficulty}</span>
                    <span className="text-slate-500">{q.points} pts · v{q.version}</span>
                    {q.tags.map((t) => (
                      <span key={t} className="text-slate-400">#{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className={btnSmall} onClick={() => edit(q.id)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button className={cn(btnSmall, 'text-red-600')} onClick={() => remove(q)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {questions && filtered.length === 0 && <p className="px-5 py-10 text-center text-slate-400">No questions found.</p>}
          </div>
        </>
      )}
    </ExaminerLayout>
  );
}
