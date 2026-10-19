import { createApp } from './app.js';
import { env } from './config/env.js';
import { startSweeper } from './jobs/sweeper.js';
import { logger } from './lib/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info('Exam API listening', { port: env.PORT, provider: env.EXECUTION_PROVIDER });
  startSweeper();
});

const shutdown = (signal: string) => {
  logger.info('Shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
