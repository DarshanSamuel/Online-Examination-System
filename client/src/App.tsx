import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { DynamicBackground } from './components/ui/DynamicBackground';
import { FullPageSpinner } from './components/ui/FullPageSpinner';
import { Login } from './pages/Login';
import { CandidateHome } from './pages/CandidateHome';
import { ExamLobby } from './pages/ExamLobby';

// Heavy screens (Monaco, dashboards) load on demand to keep the first paint small.
const ExamRoom = lazy(() => import('./pages/ExamRoom').then((m) => ({ default: m.ExamRoom })));
const ResultPage = lazy(() => import('./pages/Result').then((m) => ({ default: m.ResultPage })));
const ExaminerHome = lazy(() => import('./pages/ExaminerHome').then((m) => ({ default: m.ExaminerHome })));
const QuestionBank = lazy(() => import('./pages/examiner/QuestionBank').then((m) => ({ default: m.QuestionBank })));
const ExamEditor = lazy(() => import('./pages/examiner/ExamEditor').then((m) => ({ default: m.ExamEditor })));
const ExamDetail = lazy(() => import('./pages/examiner/ExamDetail').then((m) => ({ default: m.ExamDetail })));
const SubmissionReview = lazy(() => import('./pages/examiner/SubmissionReview').then((m) => ({ default: m.SubmissionReview })));

const candidate = (el: ReactElement) => <RequireAuth role="candidate">{el}</RequireAuth>;
const examiner = (el: ReactElement) => <RequireAuth role="examiner">{el}</RequireAuth>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DynamicBackground />
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={candidate(<CandidateHome />)} />
            <Route path="/exam/:examId/lobby" element={candidate(<ExamLobby />)} />
            <Route path="/exam/:examId/result" element={candidate(<ResultPage />)} />
            <Route path="/attempt/:submissionId" element={candidate(<ExamRoom />)} />

            <Route path="/examiner" element={examiner(<ExaminerHome />)} />
            <Route path="/examiner/questions" element={examiner(<QuestionBank />)} />
            <Route path="/examiner/exams/new" element={examiner(<ExamEditor />)} />
            <Route path="/examiner/exams/:examId" element={examiner(<ExamDetail />)} />
            <Route path="/examiner/exams/:examId/edit" element={examiner(<ExamEditor />)} />
            <Route path="/examiner/submissions/:submissionId" element={examiner(<SubmissionReview />)} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
