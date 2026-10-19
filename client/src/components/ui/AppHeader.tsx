import { GraduationCap, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to={role === 'examiner' ? '/examiner' : '/'} className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <GraduationCap className="h-4 w-4" />
          </span>
          ExamPortal
          {role === 'examiner' && <span className="ml-1 rounded bg-primary-50 px-1.5 py-0.5 text-xs font-medium text-primary-700">Examiner</span>}
        </Link>
        <div className="flex items-center gap-3">
          {user?.photoURL && <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />}
          <span className="hidden text-sm text-slate-600 sm:block">{user?.displayName}</span>
          <button onClick={signOut} title="Sign out" className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
