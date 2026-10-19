import { useParams } from 'react-router-dom';
import { ExamEnvironment } from '../components/Exam/ExamEnvironment';

export function ExamRoom() {
  const { submissionId } = useParams<{ submissionId: string }>();
  if (!submissionId) return null;
  return <ExamEnvironment submissionId={submissionId} />;
}
