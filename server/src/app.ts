import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins } from './config/env.js';
import { errorHandler } from './lib/errors.js';
import { attemptsRouter } from './routes/attempts.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { examinerRouter } from './routes/examiner.routes.js';
import { internalRouter } from './routes/internal.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind Cloud Run / a load balancer; needed for req.ip
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: false, maxAge: 600 }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  /** Clients compute `offset = serverNow - Date.now()` and run the countdown on server time. */
  app.get('/api/time', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ serverNow: Date.now() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/attempts', attemptsRouter);
  app.use('/api/examiner', examinerRouter);
  app.use('/api/internal', internalRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
