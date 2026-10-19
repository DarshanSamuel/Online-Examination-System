import { GraduationCap, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { ThemeToggle } from './ThemeToggle';

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md transition-colors duration-300">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          to={role === 'examiner' ? '/examiner' : '/'}
          className="group flex items-center gap-2.5 font-semibold tracking-tight text-slate-900 transition-colors"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm shadow-primary-600/25 transition-transform duration-200 group-hover:scale-105">
            <GraduationCap className="h-4.5 w-4.5" />
          </span>
          <span className="text-base">ExamPortal</span>
          {role === 'examiner' && (
            <span className="ml-0.5 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200/80">
              Examiner
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              className="h-8 w-8 rounded-full ring-2 ring-slate-200/80 dark:ring-slate-700"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="hidden text-sm font-medium text-slate-600 sm:block">{user?.displayName}</span>
          <button
            onClick={signOut}
            title="Sign out"
            className="cursor-pointer rounded-xl p-2 text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
