// ─── Proxy Routes ─────────────────────────────────────────────────────────────
// GET /proxies — filtered, paginated proxy list
// GET /proxies/random — single random proxy from pool

import { Hono } from 'hono';
import { queryProxy, getRandomProxy } from '../models/proxy.js';
import type { ProxyQueryOption, ProxyProtocol, AnonymityLevel } from '../types.js';

const proxy = new Hono();

proxy.get('/proxies', (c) => {
  const q = c.req.query();

  const opts: ProxyQueryOption = {
    alive_only: true,
  };

  if (q.protocol) opts.protocol = q.protocol as ProxyProtocol;
  if (q.anonymity) opts.anonymity = q.anonymity as AnonymityLevel;
  if (q.google_pass !== undefined) opts.google_pass = q.google_pass === 'true' || q.google_pass === '1';
  if (q.max_latency_ms) opts.max_latency_ms = parseInt(q.max_latency_ms, 10);
  if (q.limit) opts.limit = Math.min(parseInt(q.limit, 10), 1000);
  if (q.offset) opts.offset = parseInt(q.offset, 10);

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
