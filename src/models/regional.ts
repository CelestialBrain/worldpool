// ─── Regional Validation Model (DAL) ──────────────────────────────────────────
// SQLite data access layer for the regional_validation table.
// Stores multi-region proxy validation results from distributed Tendril nodes.

import { getDb } from '../utils/db.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('model:regional');

export interface RegionalValidationRow {
  id: number;
  proxy_id: string;
  region: string;
  node_id: string;
  alive: number;      // 0 | 1
  latency_ms: number;
  google_pass: number; // 0 | 1
  checked_at: number;
}

export interface RegionalResult {
  proxyId: string;
  region: string;
  nodeId: string;
  alive: boolean;
  latencyMs: number;
  googlePass: boolean;
  checkedAt: number;
}

function rowToResult(row: RegionalValidationRow): RegionalResult {
  return {
    proxyId: row.proxy_id,
    region: row.region,
    nodeId: row.node_id,
    alive: row.alive === 1,
    latencyMs: row.latency_ms,
    googlePass: row.google_pass === 1,
    checkedAt: row.checked_at,
  };
}

const INSERT_SQL = `
  INSERT INTO regional_validation (proxy_id, region, node_id, alive, latency_ms, google_pass, checked_at)
  VALUES ($proxy_id, $region, $node_id, $alive, $latency_ms, $google_pass, $checked_at)
`;

export const regionalModel = {
  /** Insert a batch of regional validation results. */
  saveBatch(results: RegionalResult[]): void {
    const db = getDb();
    const stmt = db.prepare(INSERT_SQL);
    const txn = db.transaction((batch: RegionalResult[]) => {
      for (const r of batch) {
        stmt.run({
          proxy_id: r.proxyId,
          region: r.region,
          node_id: r.nodeId,
          alive: r.alive ? 1 : 0,
          latency_ms: r.latencyMs,
          google_pass: r.googlePass ? 1 : 0,
          checked_at: r.checkedAt,
        });
      }
    });
    txn(results);
    log.info(`Stored ${results.length} regional validations`);
  },

  /** Get regional validation results for a specific proxy. */
  getForProxy(proxyId: string): RegionalResult[] {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM regional_validation WHERE proxy_id = ? ORDER BY checked_at DESC',
    ).all(proxyId) as RegionalValidationRow[];
    return rows.map(rowToResult);
  },

  /** Get region summary (alive by region) for a proxy. */
  getRegionSummary(proxyId: string): Array<{ region: string; alive: boolean; latencyMs: number; googlePass: boolean; checkedAt: number }> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT region,
             alive,
             latency_ms,
             google_pass,
             MAX(checked_at) as checked_at
      FROM regional_validation
      WHERE proxy_id = ?
      GROUP BY region
      ORDER BY region
    `).all(proxyId) as RegionalValidationRow[];

    return rows.map(r => ({
      region: r.region,
      alive: r.alive === 1,
      latencyMs: r.latency_ms,
      googlePass: r.google_pass === 1,
      checkedAt: r.checked_at,
    }));
  },

  /** Count validations by region. */
  countByRegion(): Array<{ region: string; total: number; alive: number }> {
    const db = getDb();
    return db.prepare(`
      SELECT region,
             COUNT(*) as total,
             SUM(CASE WHEN alive = 1 THEN 1 ELSE 0 END) as alive
      FROM regional_validation
      GROUP BY region
      ORDER BY total DESC
    `).all() as Array<{ region: string; total: number; alive: number }>;
  },

  /** Purge old results (older than N days). */
  purgeOlderThan(days: number): number {
    const db = getDb();
    const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
    const result = db.prepare('DELETE FROM regional_validation WHERE checked_at < ?').run(cutoff);
    return result.changes;
  },

  /** Get total count of stored validations. */
  getCount(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as cnt FROM regional_validation').get() as { cnt: number };
    return row.cnt;
  },
};
