// ─── Validator Service ────────────────────────────────────────────────────────
// Validates proxies for liveness, anonymity, Google pass, and latency.
// Uses p-limit for concurrency control.

import axios from 'axios';
import pLimit from 'p-limit';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { Agent } from 'http';
import type { RawProxy, ValidatedProxy, AnonymityLevel, HijackType } from '../types.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { initGeo, initGeoAsn, lookupCountry, lookupAsn } from './geolocator.js';

const log = createLogger('validator');

let ownIp: string | null = null;

async function getOwnIp(): Promise<string | null> {
  if (ownIp) return ownIp;
  try {
    const res = await axios.get<string>('https://api.ipify.org', {
      timeout: 5_000,
      responseType: 'text',
    });
    ownIp = (res.data as string).trim();
    log.info('Own IP detected', { ip: ownIp });
  } catch {
    log.warn('Could not detect own IP — anonymity detection degraded');
  }
  return ownIp;
}

function buildProxyUrl(proxy: RawProxy): string {
  return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
}

function buildAgent(proxyUrl: string, protocol: RawProxy['protocol']): { httpAgent: Agent; httpsAgent: Agent } {
  if (protocol === 'socks4' || protocol === 'socks5') {
    const agent = new SocksProxyAgent(proxyUrl) as unknown as Agent;
    return { httpAgent: agent, httpsAgent: agent };
  }
  return {
    httpAgent: new HttpProxyAgent(proxyUrl) as unknown as Agent,
    httpsAgent: new HttpsProxyAgent(proxyUrl) as unknown as Agent,
  };
}

function classifyAnonymity(
  headers: Record<string, string | string[] | undefined>,
  myIp: string | null,
): AnonymityLevel {
  const headerStr = JSON.stringify(headers).toLowerCase();

  if (myIp && headerStr.includes(myIp.toLowerCase())) {
    return 'transparent';
  }

  const proxyHeaders = ['via', 'x-forwarded-for', 'x-proxy-id', 'forwarded'];
  const hasProxyHeader = proxyHeaders.some((h) => headers[h] !== undefined);

  if (hasProxyHeader) {
    return 'anonymous';
  }

  return 'elite';
}

const AD_NETWORK_PATTERNS = [
  '<script', '<iframe', 'doubleclick.net', 'googlesyndication.com',
  'adservice.google', 'amazon-adsystem.com', 'ads.yahoo.com',
  'pagead2.googlesyndication', 'adnxs.com', 'taboola.com', 'outbrain.com',
];

const CAPTIVE_PORTAL_PATTERNS = ['<form', '<input', 'password', 'login'];

type HijackResult =
  | { hijacked: false }
  | { hijacked: true; hijack_type: HijackType; hijack_body: string };

/**
 * Send a request through the proxy to a known endpoint and verify the response
 * matches the expected structure. Returns a result object indicating whether
 * the proxy is hijacked, and if so, classifies the type and captures a body
 * sample (first 500 chars).
 */
async function checkHijacked(
  httpAgent: Agent,
  httpsAgent: Agent,
): Promise<HijackResult> {
  try {
    const res = await axios.get<unknown>('http://httpbin.org/get', {
      httpAgent,
      httpsAgent,
      timeout: config.validator.timeoutMs,
      validateStatus: () => true,
      maxRedirects: 0,
    });

    const rawBody = res.data;
    const bodyStr =
      typeof rawBody === 'string'
        ? rawBody
        : typeof rawBody === 'object'
          ? JSON.stringify(rawBody)
          : String(rawBody);
    const hijack_body = bodyStr.slice(0, 500);
    const bodyLower = hijack_body.toLowerCase();

    // ── Redirect detection ────────────────────────────────────────────────
    if (
      (res.status === 301 || res.status === 302) &&
      res.headers['location'] !== undefined
    ) {
      return { hijacked: true, hijack_type: 'redirect', hijack_body };
    }

    if (res.status !== 200) {
      return { hijacked: true, hijack_type: 'content_substitution', hijack_body };
    }

    // ── Ad injection detection ────────────────────────────────────────────
    // All patterns are already lowercase; bodyLower is already lowercased above.
    if (AD_NETWORK_PATTERNS.some((p) => bodyLower.includes(p))) {
      return { hijacked: true, hijack_type: 'ad_injection', hijack_body };
    }

    // ── Captive portal detection (HTML with login form) ───────────────────
    if (
      (bodyLower.includes('<html') || bodyLower.includes('<!doctype')) &&
      CAPTIVE_PORTAL_PATTERNS.some((p) => bodyLower.includes(p))
    ) {
      return { hijacked: true, hijack_type: 'captive_portal', hijack_body };
    }

    // ── Structural validation (expected JSON shape) ───────────────────────
    if (typeof rawBody !== 'object' || rawBody === null) {
      return { hijacked: true, hijack_type: 'content_substitution', hijack_body };
    }

    const body = rawBody as Record<string, unknown>;
    const hasOrigin = 'origin' in body;
    const hasHeaders = 'headers' in body && typeof body['headers'] === 'object';
    if (!hasOrigin || !hasHeaders) {
      return { hijacked: true, hijack_type: 'content_substitution', hijack_body };
    }

    // ── SSL-strip detection (HTTPS request served over plain HTTP) ────────
    try {
      const httpsRes = await axios.get<unknown>('https://httpbin.org/get', {
        httpAgent,
        httpsAgent,
        timeout: config.validator.timeoutMs,
        validateStatus: () => true,
      });

      if (
        httpsRes.status === 200 &&
        typeof httpsRes.data === 'object' &&
        httpsRes.data !== null
      ) {
        const httpsBody = httpsRes.data as Record<string, unknown>;
        // httpbin echoes the URL as seen by the server in its 'url' field.
        // An ssl_strip MITM intercepts the HTTPS request and forwards it as
        // plain HTTP, so the server sees an http:// URL even though the client
        // requested https://.
        if (typeof httpsBody.url === 'string' && httpsBody.url.startsWith('http://')) {
          const sslBodyStr = JSON.stringify(httpsRes.data).slice(0, 500);
          return { hijacked: true, hijack_type: 'ssl_strip', hijack_body: sslBodyStr };
        }
      }
    } catch {
      // HTTPS check failure is not penalised — proxy may not support HTTPS.
    }

    return { hijacked: false };
  } catch {
    // Network failure during hijack check — don't penalise the proxy.
    return { hijacked: false };
  }
}

export async function validateProxy(proxy: RawProxy): Promise<ValidatedProxy> {
  const proxyUrl = buildProxyUrl(proxy);
  const proxyId = `${proxy.host}:${proxy.port}`;
  const now = Math.floor(Date.now() / 1000);

  const base: ValidatedProxy = {
    proxy_id: proxyId,
    host: proxy.host,
    port: proxy.port,
    protocol: proxy.protocol,
    anonymity: 'unknown',
    latency_ms: -1,
    google_pass: false,
    alive: false,
    hijacked: false,
    country: proxy.country,
    source: proxy.source,
    last_checked: now,
  };

  try {
    const { httpAgent, httpsAgent } = buildAgent(proxyUrl, proxy.protocol);

    // ── Alive check + latency + anonymity ──────────────────────────────
    const start = Date.now();
    let judgeHeaders: Record<string, string | string[] | undefined> = {};
    let alive = false;

    try {
      const judgeRes = await axios.get<unknown>(config.judge.url, {
        httpAgent,
        httpsAgent,
        timeout: config.validator.timeoutMs,
        headers: { 'X-Judge-Token': config.judge.token },
        validateStatus: () => true,
      });
      alive = judgeRes.status >= 100 && judgeRes.status < 600;
      judgeHeaders = judgeRes.headers as Record<string, string | string[] | undefined>;
    } catch {
      // Judge unreachable — fall back to httpbin
      try {
        await axios.get('http://httpbin.org/ip', {
          httpAgent,
          httpsAgent,
          timeout: config.validator.timeoutMs,
          validateStatus: () => true,
        });
        alive = true;
      } catch {
        alive = false;
      }
    }

    const latency = Date.now() - start;

    if (!alive) {
      return { ...base, alive: false };
    }

    const myIp = await getOwnIp();
    const anonymity = classifyAnonymity(judgeHeaders, myIp);

    // ── Geo lookup ─────────────────────────────────────────────────────
    const geoCountry = lookupCountry(proxy.host);
    const country = geoCountry ?? proxy.country;
    const asn = lookupAsn(proxy.host) ?? undefined;

    // ── Hijack detection ───────────────────────────────────────────────
    const hijackResult = await checkHijacked(httpAgent, httpsAgent);

    if (hijackResult.hijacked) {
      // Persisted to DB with classification — never served to API clients
      return {
        ...base,
        alive: false,
        hijacked: true,
        hijack_type: hijackResult.hijack_type,
        hijack_body: hijackResult.hijack_body,
        country,
        asn,
      };
    }

    // ── Google pass ────────────────────────────────────────────────────
    let googlePass = false;
    if (!config.validator.skipGooglePass) {
      try {
        const { httpAgent: gHttp, httpsAgent: gHttps } = buildAgent(proxyUrl, proxy.protocol);
        const gRes = await axios.get('https://www.google.com/generate_204', {
          httpAgent: gHttp,
          httpsAgent: gHttps,
          timeout: config.validator.timeoutMs,
          validateStatus: () => true,
        });
        googlePass = gRes.status === 204;
      } catch {
        googlePass = false;
      }
    }

    return {
      ...base,
      alive: true,
      latency_ms: latency,
      anonymity,
      google_pass: googlePass,
      hijacked: false,
      asn,
      country,
    };
  } catch (err) {
    log.debug(`Validation failed for ${proxyId}`, { error: String(err) });
    return base;
  }
}

export async function validateAll(proxies: RawProxy[]): Promise<ValidatedProxy[]> {
  const limit = pLimit(config.validator.concurrency);

  log.info(`Validating ${proxies.length} proxies`, {
    concurrency: config.validator.concurrency,
    timeout_ms: config.validator.timeoutMs,
  });

  // Pre-warm own IP detection and geo database
  await Promise.all([getOwnIp(), initGeo(config.geo.mmdbPath), initGeoAsn(config.geo.asnMmdbPath)]);

  let completed = 0;
  let aliveCount = 0;
  let hijackedCount = 0;
  const results: ValidatedProxy[] = [];

  // Heartbeat every 30s — prevents Actions from killing "silent" jobs
  const heartbeat = setInterval(() => {
    log.info(`Heartbeat`, {
      completed,
      total: proxies.length,
      pct: ((completed / proxies.length) * 100).toFixed(1) + '%',
      alive: aliveCount,
      hijacked: hijackedCount,
    });
  }, 30_000);

  try {
    const tasks = proxies.map((proxy) =>
      limit(async () => {
        const result = await validateProxy(proxy);
        completed++;
        if (result.alive) aliveCount++;
        if (result.hijacked) hijackedCount++;
        results.push(result);

        // Log progress every 100 proxies
        if (completed % 100 === 0 || completed === proxies.length) {
          log.info(`Progress`, {
            completed,
            total: proxies.length,
            pct: ((completed / proxies.length) * 100).toFixed(1) + '%',
            alive: aliveCount,
            hijacked: hijackedCount,
          });
        }
      })
    );

    await Promise.all(tasks);
  } finally {
    clearInterval(heartbeat);
  }

  log.info(`Validation complete`, {
    total: results.length,
    alive: aliveCount,
    hijacked: hijackedCount,
  });

  return results;
}
