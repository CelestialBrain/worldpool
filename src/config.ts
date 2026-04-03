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
    timeoutMs: parseInt(process.env.VALIDATOR_TIMEOUT_MS ?? '5000', 10),
    maxMemoryPercent: 80,   // pause validation if memory exceeds this
    skipGooglePass: process.env.SKIP_GOOGLE_PASS === 'true',
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
    asnMmdbPath: process.env.ASN_MMDB_PATH ?? 'data/GeoLite2-ASN.mmdb',
  },

  // ─── Shodan ───────────────────────────────────────────────────────────
  shodan: {
    apiKey: process.env.SHODAN_API_KEY ?? '',
    maxPages: parseInt(process.env.SHODAN_MAX_PAGES ?? '5', 10),
  },

  // ─── Censys ───────────────────────────────────────────────────────────
  censys: {
    apiId: process.env.CENSYS_API_ID ?? '',
    apiSecret: process.env.CENSYS_API_SECRET ?? '',
    maxPages: parseInt(process.env.CENSYS_MAX_PAGES ?? '3', 10),
  },

  // ─── Scanner ──────────────────────────────────────────────────────────
  // Disabled by default — flip SCANNER_ENABLED=true to enable active probing.
  scanner: {
    enabled: process.env.SCANNER_ENABLED === 'true',
    ratePps: parseInt(process.env.SCANNER_RATE_PPS ?? '500', 10),
    concurrency: parseInt(process.env.SCANNER_CONCURRENCY ?? '100', 10),
    ports: (process.env.SCANNER_PORTS ?? '1080,3128,8080')
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p)),
    timeoutMs: parseInt(process.env.SCANNER_TIMEOUT_MS ?? '2000', 10),
    targetsFile: process.env.SCANNER_TARGETS_FILE ?? 'data/scan-targets.txt',
    excludeFile: process.env.SCANNER_EXCLUDE_FILE ?? 'data/scan-exclude.txt',
  },
} as const;
