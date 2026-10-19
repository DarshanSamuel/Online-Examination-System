/**
 * Seeds a demo exam (MCQ + numerical + coding) and assigns it to one candidate.
 *
 *   npm run seed:demo -- <examinerEmail> <candidateEmail>
 *
 * The examiner must have signed in once (so a users/{uid} doc exists) — that's what makes
 * `createdBy` match and lets them read results under the Firestore rules.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { answerKeyRef, assignmentId, collections, db } from '../config/firebase.js';
import type { AnswerKeyDoc, AssignmentDoc, ExamDoc, QuestionDoc } from '../types/schema.js';

async function main() {
  const [examinerEmail, candidateEmail] = process.argv.slice(2).map((s) => s?.trim().toLowerCase());
  if (!examinerEmail || !candidateEmail) {
    console.error('Usage: npm run seed:demo -- <examinerEmail> <candidateEmail>');
    process.exit(1);
  }

  const examiner = await collections.users.where('email', '==', examinerEmail).limit(1).get();
  if (examiner.empty) throw new Error(`No user ${examinerEmail}. Sign in once through the app first.`);
  const examinerUid = examiner.docs[0]!.id;

  const now = Timestamp.now();
  const base = { bankId: 'demo', difficulty: 'easy' as const, tags: ['demo'], createdBy: examinerUid, version: 1, createdAt: now, updatedAt: now };

  const questions: { id: string; doc: QuestionDoc; key: AnswerKeyDoc }[] = [
    {
      id: 'demo_mcq_binary_search',
      doc: {
        ...base,
        type: 'mcq',
        title: 'Binary search complexity',
        prompt: 'What is the worst-case time complexity of binary search on a sorted array of n elements?',
        points: 2,
        options: [
          { id: 'a', text: 'O(n)' },
          { id: 'b', text: 'O(log n)' },
          { id: 'c', text: 'O(n log n)' },
          { id: 'd', text: 'O(1)' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'b' },
    },
    {
      id: 'demo_num_pi',
      doc: { ...base, type: 'numerical', title: 'Circle area', prompt: 'Area of a circle with radius 2 (to 2 decimal places)?', points: 2, unit: 'units²' },
      key: { type: 'numerical', value: 12.566, tolerance: { mode: 'absolute', amount: 0.01 } },
    },
    {
      id: 'demo_code_sum',
      doc: {
        ...base,
        type: 'coding',
        title: 'Sum of two numbers',
        prompt: 'Read two integers `a` and `b` separated by a space from stdin and print `a + b`.',
        points: 6,
        starterCode: {
          python: 'a, b = map(int, input().split())\n# print the sum\n',
          javascript: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\n// print the sum\n",
          cpp: '#include <iostream>\nint main() {\n  long long a, b;\n  std::cin >> a >> b;\n  // print the sum\n}\n',
        },
        publicTestCases: [
          { id: 'p1', input: '2 3\n', expectedOutput: '5\n', weight: 1, explanation: '2 + 3 = 5' },
          { id: 'p2', input: '-4 10\n', expectedOutput: '6\n', weight: 1 },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 128_000 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '1000000000 1000000000\n', expectedOutput: '2000000000\n', weight: 2 },
          { id: 'h2', input: '0 0\n', expectedOutput: '0\n', weight: 1 },
        ],
      },
    },
  ];

  const examRef = collections.exams.doc('demo_exam');
  const exam: ExamDoc = {
    title: 'Demo Assessment',
    description: 'A short exam covering every question type.',
    instructions: 'Stay in fullscreen. Do not switch tabs. Your webcam is monitored.',
    createdBy: examinerUid,
    status: 'published',
    durationMinutes: 30,
    window: { opensAt: now, closesAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 3600_000) },
    sections: [
      { id: 'objective', title: 'Objective', poolQuestionIds: ['demo_mcq_binary_search', 'demo_num_pi'], drawCount: 2, shuffleQuestions: true, pointsPerQuestion: null },
      { id: 'coding', title: 'Coding', poolQuestionIds: ['demo_code_sum'], drawCount: 1, shuffleQuestions: false, pointsPerQuestion: null },
    ],
    settings: {
      shuffleOptions: true,
      allowedLanguages: ['python', 'javascript', 'cpp'],
      maxWarnings: 3,
      requireFullscreen: true,
      requireWebcam: true,
      requireMicrophone: true,
      snapshotIntervalSec: 60,
      audioThresholdDb: -20,
      gracePeriodSec: 30,
      showResultsToCandidate: false,
    },
    totalPoints: questions.reduce((s, q) => s + q.doc.points, 0),
    createdAt: now,
    updatedAt: now,
  };

  const assignment: AssignmentDoc = {
    examId: examRef.id,
    examTitle: exam.title,
    candidateEmail,
    candidateUid: null,
    assignedBy: examinerUid,
    assignedAt: now,
    status: 'assigned',
  };

  const batch = db.batch();
  for (const q of questions) {
    batch.set(collections.questions.doc(q.id), q.doc);
    batch.set(answerKeyRef(q.id), q.key);
  }
  batch.set(examRef, exam);
  batch.set(collections.assignments.doc(assignmentId(examRef.id, candidateEmail)), assignment);
  await batch.commit();

  console.log(`Seeded exam "${exam.title}" (${examRef.id}) and assigned it to ${candidateEmail}.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
