import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';

const STORAGE_KEY = 'examportal_theme';

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('examportal-theme-change', sync);
    return () => window.removeEventListener('examportal-theme-change', sync);
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* ignore storage errors */
    }
    setDark(next);
    window.dispatchEvent(new Event('examportal-theme-change'));
  };

  return { dark, toggle };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-600 shadow-2xs backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:translate-y-0 active:scale-95 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700/80 dark:hover:text-white',
        className,
      )}
    >
      <Sun
        className={cn(
          'h-4 w-4 transition-all duration-300',
          dark ? 'rotate-0 scale-100 text-amber-400' : 'rotate-90 scale-0 opacity-0 absolute',
        )}
      />
      <Moon
        className={cn(
          'h-4 w-4 transition-all duration-300',
          dark ? '-rotate-90 scale-0 opacity-0 absolute' : 'rotate-0 scale-100 text-slate-600',
        )}
      />
    </button>
  );
}
