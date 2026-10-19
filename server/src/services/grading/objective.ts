import type { AnswerKeyDoc, AnswerValue, QuestionGrade } from '../../types/schema.js';
import { parseStrictNumber } from './compare.js';

type McqKey = Extract<AnswerKeyDoc, { type: 'mcq' }>;
type NumKey = Extract<AnswerKeyDoc, { type: 'numerical' }>;

const FLOAT_EPS = 1e-9;

export function gradeMcq(answer: Extract<AnswerValue, { type: 'mcq' }>, key: McqKey, points: number): QuestionGrade {
  if (!answer.selectedOptionId) return { score: 0, maxScore: points, status: 'unanswered' };
  const correct = answer.selectedOptionId === key.correctOptionId;
  return { score: correct ? points : 0, maxScore: points, status: correct ? 'correct' : 'incorrect' };
}

export function gradeNumerical(answer: Extract<AnswerValue, { type: 'numerical' }>, key: NumKey, points: number): QuestionGrade {
  if (answer.value.trim() === '') return { score: 0, maxScore: points, status: 'unanswered' };
  const v = parseStrictNumber(answer.value);
  if (v === null) return { score: 0, maxScore: points, status: 'incorrect', note: 'Not a valid number' };

  const { mode, amount } = key.tolerance;
  const allowed = mode === 'relative' ? Math.abs(key.value) * amount : amount;
  const correct = Math.abs(v - key.value) <= allowed + FLOAT_EPS;
  return { score: correct ? points : 0, maxScore: points, status: correct ? 'correct' : 'incorrect' };
}
