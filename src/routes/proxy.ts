// ─── Proxy Routes ─────────────────────────────────────────────────────────────
// GET /proxies — filtered, paginated proxy list
// GET /proxies/random — single random proxy from pool

import { Hono } from 'hono';
import { queryProxy, getRandomProxy } from '../models/proxy.js';
import type { ProxyQueryOption, ProxyProtocol, AnonymityLevel } from '../types.js';

const proxy = new Hono();

const VALID_PROTOCOLS = new Set<string>(['http', 'socks4', 'socks5']);
const VALID_ANONYMITY = new Set<string>(['elite', 'anonymous', 'transparent']);

function safeInt(val: string | undefined, fallback: number, max?: number): number {
  if (!val) return fallback;
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 0) return fallback;
  return max !== undefined ? Math.min(n, max) : n;
}

proxy.get('/proxies', (c) => {
  const q = c.req.query();

  const opts: ProxyQueryOption = {
    alive_only: true,
  };

  if (q.protocol && VALID_PROTOCOLS.has(q.protocol)) opts.protocol = q.protocol as ProxyProtocol;
  if (q.anonymity && VALID_ANONYMITY.has(q.anonymity)) opts.anonymity = q.anonymity as AnonymityLevel;
  if (q.google_pass !== undefined) opts.google_pass = q.google_pass === 'true' || q.google_pass === '1';
  if (q.max_latency_ms) opts.max_latency_ms = safeInt(q.max_latency_ms, 0);
  if (q.limit) opts.limit = safeInt(q.limit, 100, 1000);
  if (q.offset) opts.offset = safeInt(q.offset, 0);

  const proxies = queryProxy(opts);

  if (q.format === 'txt') {
    return c.text(proxies.map((p) => `${p.host}:${p.port}`).join('\n'));
  }

  return c.json({ proxy: proxies, proxy_count: proxies.length });
});

proxy.get('/proxies/random', (c) => {
  const q = c.req.query();

  const opts: ProxyQueryOption = {};
  if (q.protocol) opts.protocol = q.protocol as ProxyProtocol;
  if (q.anonymity) opts.anonymity = q.anonymity as AnonymityLevel;
  if (q.google_pass !== undefined) opts.google_pass = q.google_pass === 'true' || q.google_pass === '1';
  if (q.max_latency_ms) opts.max_latency_ms = parseInt(q.max_latency_ms, 10);

  const result = getRandomProxy(opts);
  if (!result) {
    return c.json({ error: 'No proxies available' }, 404);
  }

  return c.json({ proxy: result });
});

export default proxy;
