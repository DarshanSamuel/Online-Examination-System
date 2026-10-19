import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from './env.js';

const app =
  getApps()[0] ??
  initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    credential:
      env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY
        ? cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          })
        : applicationDefault(),
  });

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

export const adminAuth = getAuth(app);

/** Admin SDK bypasses security rules — every service must do its own authz. */
export const collections = {
  users: db.collection('users'),
  exams: db.collection('exams'),
  assignments: db.collection('assignments'),
  questions: db.collection('questions'),
  submissions: db.collection('submissions'),
  similarityReports: db.collection('similarityReports'),
} as const;

export const answerKeyRef = (questionId: string) =>
  collections.questions.doc(questionId).collection('secrets').doc('answerKey');

export const assignmentId = (examId: string, email: string) => `${examId}_${email.toLowerCase()}`;
export const submissionId = (examId: string, uid: string) => `${examId}_${uid}`;
