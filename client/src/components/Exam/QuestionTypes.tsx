import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useExamStore } from '../../store/examStore';
import type { McqQuestion, NumericalQuestion } from '../../types/exam';
import { btnGhost, card } from '../ui/styles';
import { cn } from '../../lib/utils';

export function QuestionHeader({ title, points, index }: { title: string; points: number; index: number }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <h2 className="text-lg font-bold tracking-tight text-slate-900">
        <span className="mr-2 text-primary-500">Q{index + 1}.</span>
        {title}
      </h2>
      <span className="shrink-0 rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/80">
        {points} {points === 1 ? 'pt' : 'pts'}
      </span>
    </div>
  );
}

export function Prompt({ text }: { text: string }) {
  // Plain text with preserved line breaks. Swap for a sanitized markdown renderer if needed —
  // never dangerouslySetInnerHTML with examiner-authored HTML.
  return <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{text}</p>;
}

export function AnswerFooterNav({ extraAction, className }: { extraAction?: ReactNode; className?: string }) {
  const currentIndex = useExamStore((s) => s.currentIndex);
  const total = useExamStore((s) => s.questions.length);
  const goTo = useExamStore((s) => s.goTo);

  return (
    <div
      className={cn(
        'mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          className={btnGhost}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        {extraAction}
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-xs font-medium text-slate-400 sm:inline">
          Question {currentIndex + 1} of {total}
        </span>
        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === total - 1}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 dark:bg-primary-600 dark:hover:bg-primary-500"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function MCQQuestion({ question, index }: { question: McqQuestion; index: number }) {
  const saved = useExamStore((s) => s.answers[question.questionId]?.answer);
  const saveAnswer = useExamStore((s) => s.saveAnswer);
  const selected = saved?.type === 'mcq' ? saved.selectedOptionId : null;

  return (
    <div className={cn(card, 'p-6')}>
      <QuestionHeader title={question.title} points={question.points} index={index} />
      <Prompt text={question.prompt} />

      {/* Options arrive already shuffled per-candidate by the server; ids are opaque. */}
      <fieldset className="mt-6 space-y-3">
        <legend className="sr-only">Choose one answer</legend>
        {question.options.map((opt, i) => {
          const checked = selected === opt.id;
          return (
            <label
              key={opt.id}
              className={cn(
                'flex cursor-pointer items-center gap-3.5 rounded-xl border p-4 transition-all duration-200 ease-out active:scale-[0.99]',
                checked
                  ? 'border-primary-500 bg-primary-50/70 shadow-xs ring-2 ring-primary-500/20'
                  : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80',
              )}
            >
              <input
                type="radio"
                name={`mcq-${question.questionId}`}
                checked={checked}
                onChange={() => saveAnswer(question.questionId, { type: 'mcq', selectedOptionId: opt.id })}
                className="h-4 w-4 accent-primary-600"
              />
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  checked ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="font-medium text-slate-800">{opt.text}</span>
            </label>
          );
        })}
      </fieldset>

      <AnswerFooterNav
        extraAction={
          selected ? (
            <button
              type="button"
              onClick={() => saveAnswer(question.questionId, { type: 'mcq', selectedOptionId: null })}
              className="animate-tab-enter cursor-pointer text-sm font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-800 hover:underline"
            >
              Clear selection
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

/** Accepts what parseStrictNumber on the server accepts: optional sign, decimals, exponent. */
const NUMERIC_DRAFT = /^[+-]?(\d+\.?\d*|\.\d*)?([eE][+-]?\d*)?$/;

export function NumericalQuestion({ question, index }: { question: NumericalQuestion; index: number }) {
  const saved = useExamStore((s) => s.answers[question.questionId]?.answer);
  const saveAnswer = useExamStore((s) => s.saveAnswer);
  const value = saved?.type === 'numerical' ? saved.value : '';

  return (
    <div className={cn(card, 'p-6')}>
      <QuestionHeader title={question.title} points={question.points} index={index} />
      <Prompt text={question.prompt} />

      <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-slate-600">Your answer</label>
      <div className="mt-2 flex max-w-sm items-center rounded-xl border border-slate-200/90 bg-white shadow-2xs transition-all duration-200 focus-within:border-primary-500 focus-within:ring-3 focus-within:ring-primary-500/15">
        <input
          inputMode="decimal"
          autoComplete="off"
          value={value}
          maxLength={64}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (NUMERIC_DRAFT.test(v)) saveAnswer(question.questionId, { type: 'numerical', value: v });
          }}
          placeholder="e.g. 12.57"
          className="w-full rounded-xl bg-transparent px-4 py-2.5 font-mono outline-none"
        />
        {question.unit && <span className="pr-4 text-sm font-medium text-slate-500">{question.unit}</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500">Numbers only. Scientific notation like 1.2e-3 is accepted.</p>

      <AnswerFooterNav
        extraAction={
          value ? (
            <button
              type="button"
              onClick={() => saveAnswer(question.questionId, { type: 'numerical', value: '' })}
              className="animate-tab-enter cursor-pointer text-sm font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-800 hover:underline"
            >
              Clear answer
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
