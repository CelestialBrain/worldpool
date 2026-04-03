// ─── Structured Logger ────────────────────────────────────────────────────────
// Usage: const log = createLogger('validator');
//        log.info('Validation complete', { alive_count: 812 });
//
// Filtering: LOG_LEVEL=debug|info|warn|error (default: info)
// Timestamps: Manila timezone (Asia/Manila)

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

function timestamp(): string {
  return new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

export function createLogger(prefix: string) {
  const fmt = (level: string, msg: string, data?: unknown) => {
    const base = `[${timestamp()}] [${prefix}] [${level.toUpperCase()}] ${msg}`;
    return data !== undefined ? `${base} ${JSON.stringify(data)}` : base;
  };

  return {
    debug: (msg: string, data?: unknown) => {
      if (shouldLog('debug')) console.debug(fmt('debug', msg, data));
    },
    info: (msg: string, data?: unknown) => {
      if (shouldLog('info')) console.log(fmt('info', msg, data));
    },
    warn: (msg: string, data?: unknown) => {
      if (shouldLog('warn')) console.warn(fmt('warn', msg, data));
    },
    error: (msg: string, data?: unknown) => {
      if (shouldLog('error')) console.error(fmt('error', msg, data));
    },
  };
}
