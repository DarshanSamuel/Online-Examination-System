import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const isHttpError = (e: unknown, code?: string): e is HttpError =>
  e instanceof HttpError && (code === undefined || e.code === code);

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten() } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // body-parser errors (payload too large, malformed JSON)
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status < 500) {
    res.status(status).json({ error: { code: err.type ?? 'BAD_REQUEST', message: err.message } });
    return;
  }
  logger.error('Unhandled error', { path: req.path, err: err instanceof Error ? err.stack : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
};
