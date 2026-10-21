import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Folder, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { QuestionForm } from '../../components/examiner/QuestionForm';
import { useAuth } from '../../auth/AuthProvider';
import { deleteQuestion, examsUsingQuestion, listExams, listQuestions, loadQuestion, moveQuestionToBank } from '../../lib/examinerData';
import type { AnswerKey, Exam, Question } from '../../types/examiner';
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
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Question['type']>('all');
  const [editor, setEditor] = useState<null | { question: Question; key: AnswerKey } | 'new'>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [qList, eList] = await Promise.all([listQuestions(user.uid), listExams(user.uid)]);
      setQuestions(qList);
      setExams(eList);
    } catch {
      setError('Could not load questions.');
    }
  }, [user]);

  useEffect(() => void refresh(), [refresh]);

  const examMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of exams) {
      map.set(e.id, e.title);
    }
    return map;
  }, [exams]);

  const categories = useMemo(() => {
    const list: { id: string; label: string; count: number }[] = [];
    const counts: Record<string, number> = {};
    let defaultCount = 0;

    for (const q of questions ?? []) {
      const b = q.bankId || 'default';
      if (b === 'default') defaultCount++;
      else counts[b] = (counts[b] || 0) + 1;
    }

    list.push({ id: 'all', label: 'All Questions', count: questions?.length ?? 0 });

    for (const e of exams) {
      list.push({ id: e.id, label: e.title, count: counts[e.id] ?? 0 });
    }

    for (const b of Object.keys(counts)) {
      if (!exams.some((e) => e.id === b)) {
        list.push({ id: b, label: b, count: counts[b] });
      }
    }

    if (defaultCount > 0 || exams.length === 0) {
      list.push({ id: 'default', label: 'General / Unassigned', count: defaultCount });
    }

    return list;
  }, [questions, exams]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (questions ?? []).filter((q) => {
      const qBank = q.bankId || 'default';
      const matchesCategory = selectedCategory === 'all' || qBank === selectedCategory;
      const matchesType = typeFilter === 'all' || q.type === typeFilter;
      const matchesSearch = !s || q.title.toLowerCase().includes(s) || q.tags.some((t) => t.toLowerCase().includes(s));
      return matchesCategory && matchesType && matchesSearch;
    });
  }, [questions, search, typeFilter, selectedCategory]);

  const getCategoryLabel = (bankId?: string) => {
    if (!bankId || bankId === 'default') return 'General';
    return examMap.get(bankId) || bankId;
  };

  const handleMove = async (q: Question, targetBankId: string) => {
    let target = targetBankId;
    if (target === '__new__') {
      const custom = prompt('Enter new topic / exam name:');
      if (!custom?.trim()) return;
      target = custom.trim();
    }
    const currentBank = q.bankId || 'default';
    if (currentBank === target) return;

    setMovingId(q.id);
    try {
      await moveQuestionToBank(q.id, target);
      await refresh();
    } catch (err) {
      setError((err as Error).message || 'Failed to move question.');
    } finally {
      setMovingId(null);
    }
  };

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
            bankId={editor === 'new' ? (selectedCategory === 'all' ? 'default' : selectedCategory) : undefined}
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
              <p className="mt-0.5 text-sm text-slate-500">Questions are categorized by exams and topics. Pool them into your exams.</p>
            </div>
            <button className={btnPrimary} onClick={() => setEditor('new')}>
              <Plus className="h-4 w-4" /> New question
            </button>
          </div>

          {/* Exam / Topic Categories Bar */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3.5">
            <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Folder className="h-3.5 w-3.5" /> Exams / Topics:
            </span>
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
                    isActive
                      ? 'bg-primary-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900',
                  )}
                >
                  <span className="max-w-[160px] truncate">{cat.label}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.2 text-[10px] font-semibold',
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600',
                    )}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
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
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 font-medium text-primary-700 ring-1 ring-inset ring-primary-200/60">
                      Exam: {getCategoryLabel(q.bankId)}
                    </span>
                    {q.tags.map((t) => (
                      <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">#{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Move question to another exam/category */}
                  <div className="relative inline-flex items-center">
                    <select
                      disabled={movingId === q.id}
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) void handleMove(q, val);
                      }}
                      title="Move to another exam or topic"
                      aria-label="Move question to another exam"
                      className={cn(
                        btnSmall,
                        'cursor-pointer py-1.5 pr-7 text-slate-600 bg-white hover:bg-slate-50 appearance-none font-medium',
                        movingId === q.id && 'opacity-50 pointer-events-none',
                      )}
                    >
                      <option value="" disabled>
                        Move to…
                      </option>
                      {exams.map((ex) => (
                        <option key={ex.id} value={ex.id} disabled={(q.bankId || 'default') === ex.id}>
                          {ex.title}
                        </option>
                      ))}
                      <option value="default" disabled={(q.bankId || 'default') === 'default'}>
                        General / Unassigned
                      </option>
                      <option value="__new__">+ New topic / exam…</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400" />
                  </div>

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
