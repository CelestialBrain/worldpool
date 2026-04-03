// ─── Worldpool Configuration ──────────────────────────────────────────────────
// All config flows through this module. Env overrides for production.

export const config = {
  // ─── Server ───────────────────────────────────────────────────────────
  port: parseInt(process.env.PORT ?? '3000', 10),

  // ─── Database ─────────────────────────────────────────────────────────
  dbPath: process.env.DB_PATH ?? 'worldpool.db',

  // ─── Validator ────────────────────────────────────────────────────────
  validator: {
    concurrency: parseInt(process.env.VALIDATOR_CONCURRENCY ?? '100', 10),
    timeoutMs: parseInt(process.env.VALIDATOR_TIMEOUT_MS ?? '8000', 10),
    maxMemoryPercent: 80,   // pause validation if memory exceeds this
  },

  // ─── Judge Server ─────────────────────────────────────────────────────
  judge: {
    url: process.env.JUDGE_URL ?? 'http://localhost:3001/judge',
    token: process.env.JUDGE_TOKEN ?? 'dev-token',
  },

  // ─── Scheduler ────────────────────────────────────────────────────────
  scheduler: {
    intervalMs: parseInt(process.env.REFRESH_INTERVAL_MS ?? String(6 * 60 * 60 * 1000), 10), // 6 hours
  },

  // ─── Admin ────────────────────────────────────────────────────────────
  adminToken: process.env.ADMIN_TOKEN ?? 'dev-admin-token',

  // ─── Export ───────────────────────────────────────────────────────────
  export: {
    proxiesDir: 'proxies',
    dataDir: 'data',
  },

  // ─── Geo ──────────────────────────────────────────────────────────────
  geo: {
    mmdbPath: process.env.MMDB_PATH ?? 'data/GeoLite2-Country.mmdb',
  },
} as const;
