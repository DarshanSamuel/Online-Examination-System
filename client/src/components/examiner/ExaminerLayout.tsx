import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, LayoutList } from 'lucide-react';
import { AppHeader } from '../ui/AppHeader';
import { cn } from '../../lib/utils';

const tab = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium',
    isActive ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800',
  );

export function ExaminerLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-6xl gap-6 px-6 pt-3">
          <NavLink to="/examiner" end className={tab}>
            <LayoutList className="h-4 w-4" /> Exams
          </NavLink>
          <NavLink to="/examiner/questions" className={tab}>
            <BookOpen className="h-4 w-4" /> Question bank
          </NavLink>
        </nav>
      </div>
      <main className={cn('mx-auto px-6 py-8', wide ? 'max-w-7xl' : 'max-w-6xl')}>{children}</main>
    </div>
  );
}
