/**
 * Vercel serverless entry point.
 *
 * `npm run build` compiles src/ → dist/ with tsc first (see vercel.json `buildCommand`), so this
 * file only imports plain JS — avoiding @vercel/node's per-file TS transpilation, which does not
 * understand NodeNext-style `./foo.js` specifiers that point at `.ts` sources.
 *
 * An Express app is a valid `(req, res) => void` handler, so it can be exported directly.
 * The in-process sweeper is NOT started here; Vercel Cron calls /api/internal/sweep instead.
 */
import { createApp } from '../dist/app.js';

export default createApp();
