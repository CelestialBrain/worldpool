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
  HijackType,
  HijackedProxyResponse,
  SourceQuality,
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
    reliability_pct: row.reliability_pct,
  };
}

export function upsertProxy(proxies: ValidatedProxy[]): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    INSERT INTO proxy
      (proxy_id, host, port, protocol, anonymity, latency_ms, google_pass, alive, hijacked,
       hijack_type, hijack_body, asn, country, source, last_checked, created_at,
       check_count, alive_count, reliability_pct, site_pass)
    VALUES
      (@proxy_id, @host, @port, @protocol, @anonymity, @latency_ms, @google_pass, @alive, @hijacked,
       @hijack_type, @hijack_body, @asn, @country, @source, @last_checked, @created_at,
       @check_count, @alive_count, @reliability_pct, @site_pass)
    ON CONFLICT(proxy_id) DO UPDATE SET
      anonymity       = excluded.anonymity,
      latency_ms      = excluded.latency_ms,
      google_pass     = excluded.google_pass,
      alive           = excluded.alive,
      hijacked        = excluded.hijacked,
      hijack_type     = excluded.hijack_type,
      hijack_body     = excluded.hijack_body,
      asn             = excluded.asn,
      country         = excluded.country,
      source          = excluded.source,
      last_checked    = excluded.last_checked,
      site_pass       = excluded.site_pass,
      check_count     = proxy.check_count + 1,
      alive_count     = proxy.alive_count + excluded.alive,
      reliability_pct = ROUND(
        CAST(proxy.alive_count + excluded.alive AS REAL)
        / CAST(proxy.check_count + 1 AS REAL) * 100.0, 1
      )
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
        hijack_type: p.hijack_type ?? null,
        hijack_body: p.hijack_body ?? null,
        asn: p.asn ?? null,
        country: p.country ?? null,
        source: p.source ?? null,
        last_checked: p.last_checked,
        site_pass: p.site_pass ? JSON.stringify(p.site_pass) : null,
        created_at: now,
        // Uptime counters: INSERT uses absolute values for the first check;
        // the ON CONFLICT clause uses incremental SQL to update existing rows.
        check_count: 1,
        alive_count: p.alive ? 1 : 0,
        reliability_pct: p.alive ? 100.0 : 0.0,
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
  if (opts.country) {
    conditions.push('country = @country');
    params.country = opts.country.toUpperCase();
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
        AVG(CASE WHEN check_count > 0 THEN reliability_pct ELSE NULL END) as avg_reliability_pct,
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
    avg_reliability_pct: number | null;
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
    avg_reliability_pct: Math.round((totals.avg_reliability_pct ?? 0) * 10) / 10,
    by_protocol: byProtocol as ProtocolBreakdown[],
    last_updated: totals.last_updated ?? null,
  };
}

/**
 * Return all hijacked proxies with their classification and body sample.
 * Used to generate the threat-intel output files.
 */
export function queryHijacked(): HijackedProxyResponse[] {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT host, port, hijack_type, hijack_body, country, asn, last_checked
       FROM proxy
       WHERE hijacked = 1 AND hijack_type IS NOT NULL
       ORDER BY last_checked DESC`,
    )
    .all() as Array<{
    host: string;
    port: number;
    hijack_type: string;
    hijack_body: string | null;
    country: string | null;
    asn: string | null;
    last_checked: number;
  }>;

  return rows.map((r) => ({
    ip: r.host,
    port: r.port,
    hijack_type: r.hijack_type as HijackType,
    hijack_body: r.hijack_body,
    country: r.country,
    asn: r.asn,
    detected_at: r.last_checked,
  }));
}

/**
 * Return alive, non-hijacked proxies within a latency range, ordered by latency ASC.
 * Used to populate the by-speed/ tier exports.
 */
export function queryProxyByLatencyRange(
  minLatencyMs: number,
  maxLatencyMs: number,
): ProxyResponse[] {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT * FROM proxy
       WHERE alive = 1 AND hijacked = 0
         AND latency_ms >= @min AND latency_ms <= @max
       ORDER BY latency_ms ASC`,
    )
    .all({ min: minLatencyMs, max: maxLatencyMs }) as ProxyRow[];

  return rows.map(rowToResponse);
}

/**
 * Return per-source quality metrics, ordered by alive_pct DESC.
 * Used to populate the source_quality field in data/stats.json.
 */
/**
 * Return alive, non-hijacked proxies that pass a specific site check.
 * Reads the site_pass JSON column.
 */
export function queryBySitePass(site: string): ProxyResponse[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM proxy
       WHERE alive = 1 AND hijacked = 0
         AND site_pass IS NOT NULL
         AND json_extract(site_pass, '$.' || @site) = 1
       ORDER BY latency_ms ASC`,
    )
    .all({ site }) as ProxyRow[];
  return rows.map(rowToResponse);
}

/**
 * Return proxy IDs that were checked within the last `withinSec` seconds
 * and found dead. These can be skipped during the next validation run —
 * no point re-checking a proxy that was dead 1 hour ago.
 *
 * Proxies that were alive on their last check are NOT returned — they
 * must always be re-validated since they might have died.
 *
 * Proxies with consecutive dead checks beyond `maxConsecutiveDead` are
 * also excluded (permanently dead, not worth retrying).
 */
/**
 * Return proxies that were alive on their last check.
 * These should always be re-validated even if they don't appear in source lists.
 */
export function getPreviouslyAliveProxies(): Array<{ proxy_id: string; host: string; port: number; protocol: string; country: string | null; source: string | null }> {
  const db = getDb();
  return db
    .prepare(
      `SELECT proxy_id, host, port, protocol, country, source
       FROM proxy
       WHERE alive = 1 AND hijacked = 0`,
    )
    .all() as Array<{ proxy_id: string; host: string; port: number; protocol: string; country: string | null; source: string | null }>;
}

export function getRecentlyDeadProxyIds(withinSec: number): Set<string> {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - withinSec;

  const rows = db
    .prepare(
      `SELECT proxy_id FROM proxy
       WHERE alive = 0
         AND last_checked >= @cutoff`,
    )
    .all({ cutoff }) as Array<{ proxy_id: string }>;

  return new Set(rows.map(r => r.proxy_id));
}

/**
 * Return ALL proxies ever stored in the database — alive, dead, hijacked, everything.
 * Used for the cumulative all-ever-seen.txt export.
 */
export function queryAllEverSeen(): ProxyResponse[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM proxy ORDER BY last_checked DESC`)
    .all() as ProxyRow[];
  return rows.map(rowToResponse);
}

export function getSourceQuality(): SourceQuality[] {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT
         source,
         COUNT(*) as total,
         SUM(CASE WHEN alive = 1 THEN 1 ELSE 0 END) as alive,
         SUM(CASE WHEN anonymity = 'elite' AND alive = 1 THEN 1 ELSE 0 END) as elite,
         SUM(CASE WHEN google_pass = 1 AND alive = 1 THEN 1 ELSE 0 END) as google_pass,
         AVG(CASE WHEN alive = 1 AND latency_ms >= 0 THEN latency_ms ELSE NULL END) as avg_latency_ms,
         ROUND(CAST(SUM(CASE WHEN alive = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 1) as alive_pct
       FROM proxy
       WHERE source IS NOT NULL
       GROUP BY source
       ORDER BY alive_pct DESC`,
    )
    .all() as SourceQuality[];

  return rows;
}
