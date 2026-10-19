import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { api, apiErrorMessage } from '../lib/api';
import type { Role } from '../types/exam';

interface AuthState {
  user: User | null;
  /** From the verified ID-token custom claim — the same value the backend authorizes on. */
  role: Role | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Session flow:
 *  1. Google popup sign-in (the only provider; the backend rejects any other).
 *  2. POST /api/auth/session upserts users/{uid} and assigns the `role` custom claim.
 *  3. If the claim was just set, force-refresh the ID token so it carries the role.
 * The role shown in the UI is read from the token itself, never from client state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const establishSession = useCallback(async (u: User) => {
    const { data } = await api.post<{ role: Role; claimsUpdated: boolean }>('/auth/session');
    const token = await u.getIdTokenResult(data.claimsUpdated);
    setRole(token.claims.role === 'examiner' ? 'examiner' : 'candidate');
  }, []);

  useEffect(() => {
    let sessionFor: string | null = null;
    return onIdTokenChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        sessionFor = null;
        setRole(null);
        setLoading(false);
        return;
      }
      // onIdTokenChanged fires on every hourly refresh; only call the API once per sign-in.
      if (sessionFor === u.uid) {
        const token = await u.getIdTokenResult();
        setRole(token.claims.role === 'examiner' ? 'examiner' : 'candidate');
        return;
      }
      sessionFor = u.uid;
      try {
        await establishSession(u);
        setError(null);
      } catch (err) {
        setError(apiErrorMessage(err));
        setRole(null);
      } finally {
        setLoading(false);
      }
    });
  }, [establishSession]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError((err as Error).message);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, error, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
