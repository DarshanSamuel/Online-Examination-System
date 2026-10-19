import axios, { AxiosError } from 'axios';
import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

/** Attach a fresh Firebase ID token to every request (the SDK refreshes it automatically). */
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Backend error envelope: `{ error: { code, message } }` (server/src/lib/errors.ts). */
export function apiErrorCode(err: unknown): string | undefined {
  return (err as AxiosError<{ error?: { code?: string } }>)?.response?.data?.error?.code;
}

export function apiErrorMessage(err: unknown): string {
  const e = err as AxiosError<{ error?: { message?: string } }>;
  return e?.response?.data?.error?.message ?? e?.message ?? 'Something went wrong';
}

/** True for failures worth retrying later (offline, timeout, 5xx) — not for 4xx rejections. */
export function isTransient(err: unknown): boolean {
  const e = err as AxiosError;
  if (!e?.response) return true;
  return e.response.status >= 500 || e.response.status === 429;
}

/** Codes meaning the attempt is over; the client should stop writing and show the end screen. */
export const ATTEMPT_OVER_CODES = new Set(['ATTEMPT_CLOSED', 'ATTEMPT_EXPIRED']);
