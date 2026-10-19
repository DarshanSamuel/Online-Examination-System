import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { Role } from '../types/exam';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';

/**
 * UX-only guard. Real enforcement is server-side (requireAuth / requireRole + Firestore rules);
 * this just keeps users from landing on screens whose API calls would 401/403.
 */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, role: myRole, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!myRole) return <FullPageSpinner label="Setting up your account…" />;
  if (role && myRole !== role) return <Navigate to={myRole === 'examiner' ? '/examiner' : '/'} replace />;
  return <>{children}</>;
}
