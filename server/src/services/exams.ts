import { collections } from '../config/firebase.js';
import { HttpError } from '../lib/errors.js';
import type { ExamDoc } from '../types/schema.js';

/** Examiners may only act on exams they created. */
export async function assertExamOwner(examId: string, uid: string): Promise<ExamDoc> {
  const exam = (await collections.exams.doc(examId).get()).data() as ExamDoc | undefined;
  if (!exam || exam.createdBy !== uid) throw new HttpError(404, 'Exam not found', 'EXAM_NOT_FOUND');
  return exam;
}
