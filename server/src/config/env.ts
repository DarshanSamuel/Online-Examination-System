import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  EXAMINER_EMAILS: z.string().default(''),

  EXECUTION_PROVIDER: z.enum(['judge0', 'piston']).default('judge0'),
  JUDGE0_URL: z.string().url().default('https://judge0-ce.p.rapidapi.com'),
  JUDGE0_RAPIDAPI_KEY: z.string().optional(),
  JUDGE0_RAPIDAPI_HOST: z.string().optional(),
  JUDGE0_AUTH_HEADER: z.string().optional(),
  JUDGE0_AUTH_TOKEN: z.string().optional(),
  PISTON_URL: z.string().url().default('http://localhost:2000'),

  MAX_CODE_BYTES: z.coerce.number().int().positive().default(64 * 1024),
  RUN_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  ENABLE_SWEEPER: bool,
  SWEEPER_INTERVAL_SEC: z.coerce.number().int().positive().default(30),
  /** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` to /api/internal/sweep. */
  CRON_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const examinerAllowlist = new Set(
  env.EXAMINER_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
