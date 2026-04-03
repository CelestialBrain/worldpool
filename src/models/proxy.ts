// ─── Proxy Model (DAL) ────────────────────────────────────────────────────────
// All SQLite queries for the `proxy` table live here.
// No raw SQL in routes — always go through this module.

import { getDb } from '../utils/db.js';
import type {
  ValidatedProxy,
  ProxyResponse,
  ProxyQueryOption,
  PoolStatsResponse,
  ProxyRow,
  ProtocolBreakdown,
  ProxyProtocol,
} from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('model:proxy');

function rowToResponse(row: ProxyRow): ProxyResponse {
  return {
    id: row.proxy_id,
    host: row.host,
    port: row.port,
    protocol: row.protocol,
    anonymity: row.anonymity,
    latency_ms: row.latency_ms,
    google_pass: row.google_pass === 1,
    hijacked: row.hijacked === 1,
    country: row.country,
    last_checked: row.last_checked,
  };
}

export function upsertProxy(proxies: ValidatedProxy[]): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    INSERT INTO proxy
      (proxy_id, host, port, protocol, anonymity, latency_ms, google_pass, alive, hijacked,
       country, source, last_checked, created_at)
    VALUES
      (@proxy_id, @host, @port, @protocol, @anonymity, @latency_ms, @google_pass, @alive, @hijacked,
       @country, @source, @last_checked, @created_at)
    ON CONFLICT(proxy_id) DO UPDATE SET
      anonymity    = excluded.anonymity,
      latency_ms   = excluded.latency_ms,
      google_pass  = excluded.google_pass,
      alive        = excluded.alive,
      hijacked     = excluded.hijacked,
      country      = excluded.country,
      source       = excluded.source,
      last_checked = excluded.last_checked
  `);

  const insert = db.transaction((items: ValidatedProxy[]) => {
    for (const p of items) {
      stmt.run({
        proxy_id: p.proxy_id,
        host: p.host,
        port: p.port,
        protocol: p.protocol,
        anonymity: p.anonymity,
        latency_ms: p.latency_ms,
        google_pass: p.google_pass ? 1 : 0,
        alive: p.alive ? 1 : 0,
        hijacked: p.hijacked ? 1 : 0,
        country: p.country ?? null,
        source: p.source ?? null,
        last_checked: p.last_checked,
        created_at: now,
      });
    }
  });

  insert(proxies);
  log.info(`Upserted ${proxies.length} proxies`);
}

export function queryProxy(opts: ProxyQueryOption): ProxyResponse[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  // Default: only return alive, non-hijacked proxies unless caller opts out
  const aliveOnly = opts.alive_only !== false;
  if (aliveOnly) {
    conditions.push('alive = 1', 'hijacked = 0');
  }

  if (opts.protocol) {
    conditions.push('protocol = @protocol');
    params.protocol = opts.protocol;
  }
  if (opts.anonymity) {
    conditions.push('anonymity = @anonymity');
    params.anonymity = opts.anonymity;
  }
  if (opts.google_pass !== undefined) {
    conditions.push('google_pass = @google_pass');
    params.google_pass = opts.google_pass ? 1 : 0;
  }
  if (opts.max_latency_ms !== undefined) {
    conditions.push('latency_ms <= @max_latency_ms');
    params.max_latency_ms = opts.max_latency_ms;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const sql = `
    SELECT * FROM proxy
    ${where}
    ORDER BY latency_ms ASC
    LIMIT @limit OFFSET @offset
  `;

  params.limit = limit;
  params.offset = offset;

  const rows = db.prepare(sql).all(params) as ProxyRow[];
  return rows.map(rowToResponse);
}

export function getRandomProxy(opts: ProxyQueryOption = {}): ProxyResponse | null {
  const db = getDb();
  const conditions: string[] = ['alive = 1', 'hijacked = 0'];
  const params: Record<string, unknown> = {};

  if (opts.protocol) {
    conditions.push('protocol = @protocol');
    params.protocol = opts.protocol;
  }
  if (opts.anonymity) {
    conditions.push('anonymity = @anonymity');
    params.anonymity = opts.anonymity;
  }
  if (opts.google_pass !== undefined) {
    conditions.push('google_pass = @google_pass');
    params.google_pass = opts.google_pass ? 1 : 0;
  }
  if (opts.max_latency_ms !== undefined) {
    conditions.push('latency_ms <= @max_latency_ms');
    params.max_latency_ms = opts.max_latency_ms;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  params.pool_size = 200;

  const sql = `
    SELECT * FROM proxy
    ${where}
    ORDER BY latency_ms ASC
    LIMIT @pool_size
  `;

  const rows = db.prepare(sql).all(params) as ProxyRow[];
  if (rows.length === 0) return null;

  const row = rows[Math.floor(Math.random() * rows.length)];
  return rowToResponse(row);
}

export function getStats(): PoolStatsResponse {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT
        COUNT(*) as proxy_count,
        SUM(CASE WHEN alive = 1 THEN 1 ELSE 0 END) as alive_count,
        SUM(CASE WHEN anonymity = 'elite' AND alive = 1 THEN 1 ELSE 0 END) as elite_count,
        SUM(CASE WHEN google_pass = 1 AND alive = 1 THEN 1 ELSE 0 END) as google_pass_count,
        SUM(CASE WHEN hijacked = 1 THEN 1 ELSE 0 END) as hijacked_count,
        AVG(CASE WHEN alive = 1 AND latency_ms >= 0 THEN latency_ms ELSE NULL END) as avg_latency_ms,
        MAX(last_checked) as last_updated
      FROM proxy`,
    )
    .get() as {
    proxy_count: number;
    alive_count: number;
    elite_count: number;
    google_pass_count: number;
    hijacked_count: number;
    avg_latency_ms: number | null;
    last_updated: number | null;
  };

  const byProtocol = db
    .prepare(
      `SELECT protocol, COUNT(*) as proxy_count
       FROM proxy
       WHERE alive = 1
       GROUP BY protocol`,
    )
    .all() as Array<{ protocol: ProxyProtocol; proxy_count: number }>;

  return {
    proxy_count: totals.proxy_count ?? 0,
    alive_count: totals.alive_count ?? 0,
    elite_count: totals.elite_count ?? 0,
    google_pass_count: totals.google_pass_count ?? 0,
    hijacked_count: totals.hijacked_count ?? 0,
    avg_latency_ms: Math.round(totals.avg_latency_ms ?? 0),
    by_protocol: byProtocol as ProtocolBreakdown[],
    last_updated: totals.last_updated ?? null,
  };
}
