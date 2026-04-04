// ─── Tendril Config ───────────────────────────────────────────────────────────
// Tendril-specific configuration merged into the main Worldpool config.

export interface TendrilConfig {
  enabled: boolean;
  swarmTopic: string;
  port: number;
  maxConcurrentJob: number;
  requestPerSecond: number;
  defaultTimeoutMs: number;
  batchSize: number;
  collectTimeoutMs: number;
}

export function loadTendrilConfig(): TendrilConfig {
  return {
    enabled: process.env.TENDRIL_ENABLED === 'true',
    swarmTopic: process.env.TENDRIL_TOPIC ?? 'worldpool',
    port: parseInt(process.env.TENDRIL_PORT ?? '3001', 10),
    maxConcurrentJob: parseInt(process.env.TENDRIL_MAX_CONCURRENT ?? '5', 10),
    requestPerSecond: parseInt(process.env.TENDRIL_RPS ?? '10', 10),
    defaultTimeoutMs: parseInt(process.env.TENDRIL_TIMEOUT_MS ?? '30000', 10),
    batchSize: parseInt(process.env.TENDRIL_BATCH_SIZE ?? '500', 10),
    collectTimeoutMs: parseInt(process.env.TENDRIL_COLLECT_TIMEOUT_MS ?? '300000', 10),
  };
}
