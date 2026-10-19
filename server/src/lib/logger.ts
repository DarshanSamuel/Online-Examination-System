type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...meta });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

/** Structured JSON logger (Cloud Logging / Loki friendly). */
export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
