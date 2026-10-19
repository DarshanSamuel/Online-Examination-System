import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, LayoutList } from 'lucide-react';
import { AppHeader } from '../ui/AppHeader';
import { cn } from '../../lib/utils';

const tab = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98]',
    isActive
      ? 'bg-primary-50/90 text-primary-700 shadow-2xs ring-1 ring-inset ring-primary-200/80'
      : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-800',
  );

export function ExaminerLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-transparent">
      <AppHeader />
      <div className="border-b border-slate-200/80 bg-white/75 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl gap-2 px-6 py-2">
          <NavLink to="/examiner" end className={tab}>
            <LayoutList className="h-4 w-4" /> Exams
          </NavLink>
          <NavLink to="/examiner/questions" className={tab}>
            <BookOpen className="h-4 w-4" /> Question bank
          </NavLink>
        </nav>
      </div>
      <main
        key={location.pathname}
        className={cn('animate-page-enter mx-auto px-6 py-8', wide ? 'max-w-7xl' : 'max-w-6xl')}
      >
        {children}
      </main>
    </div>
  );
}
