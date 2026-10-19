import { Navigate, useLocation } from 'react-router-dom';
import { GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export function Login() {
  const { user, role, loading, error, signInWithGoogle } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from;

  if (user && role) return <Navigate to={from ?? (role === 'examiner' ? '/examiner' : '/')} replace />;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-transparent p-6">
      <div className="fixed top-5 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="animate-modal-pop w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-6 flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-600/30">
          <GraduationCap className="h-6 w-6" />
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">ExamPortal</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Secure online assessments</p>

        <button
          onClick={signInWithGoogle}
          disabled={loading && !!user}
          className="mt-8 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 font-medium text-slate-700 shadow-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
        >
          {loading && user ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
          )}
          Continue with Google
        </button>

        {error && <p className="animate-tab-enter mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-500" /> Google sign-in is required for identity verification
        </p>
      </div>
    </div>
  );
}
