import { useExamStore } from '../../store/examStore';
import type { McqQuestion, NumericalQuestion } from '../../types/exam';
import { cn } from '../../lib/utils';

export function QuestionHeader({ title, points, index }: { title: string; points: number; index: number }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <h2 className="text-lg font-semibold text-slate-900">
        <span className="mr-2 text-slate-400">Q{index + 1}.</span>
        {title}
      </h2>
      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
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

export function MCQQuestion({ question, index }: { question: McqQuestion; index: number }) {
  const saved = useExamStore((s) => s.answers[question.questionId]?.answer);
  const saveAnswer = useExamStore((s) => s.saveAnswer);
  const selected = saved?.type === 'mcq' ? saved.selectedOptionId : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
                'flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors',
                checked ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-slate-200 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name={`mcq-${question.questionId}`}
                checked={checked}
                onChange={() => saveAnswer(question.questionId, { type: 'mcq', selectedOptionId: opt.id })}
                className="h-4 w-4 accent-primary-600"
              />
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-slate-800">{opt.text}</span>
            </label>
          );
        })}
      </fieldset>

      {selected && (
        <button
          onClick={() => saveAnswer(question.questionId, { type: 'mcq', selectedOptionId: null })}
          className="mt-4 text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          Clear selection
        </button>
      )}
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <QuestionHeader title={question.title} points={question.points} index={index} />
      <Prompt text={question.prompt} />

      <label className="mt-6 block text-sm font-medium text-slate-700">Your answer</label>
      <div className="mt-2 flex max-w-sm items-center rounded-lg border border-slate-300 bg-white focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
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
          className="w-full rounded-lg bg-transparent px-4 py-2.5 font-mono outline-none"
        />
        {question.unit && <span className="pr-4 text-sm text-slate-500">{question.unit}</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500">Numbers only. Scientific notation like 1.2e-3 is accepted.</p>
    </div>
  );
}
