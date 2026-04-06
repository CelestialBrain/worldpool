// ─── Validator Service ────────────────────────────────────────────────────────
// Validates proxies for liveness, anonymity, Google pass, and latency.
// Uses p-limit for concurrency control.

import axios from 'axios';
import pLimit from 'p-limit';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { Agent } from 'http';
import type { RawProxy, ValidatedProxy, AnonymityLevel, HijackType, SitePassKey } from '../types.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { initGeo, initGeoAsn, lookupCountry, lookupAsn, prewarmFreeGeoCache } from './geolocator.js';

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
  'popads.net',
];

const CAPTIVE_PORTAL_PATTERNS = ['<form', '<input', 'password', 'login', 'captive', 'portal', 'authenticate'];

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
      ([301, 302, 307, 308].includes(res.status)) ||
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
    } catch (httpsErr) {
      // HTTPS check failure is not penalised — proxy may not support HTTPS.
      log.debug('HTTPS hijack check failed (proxy may not support HTTPS)', { error: String(httpsErr) });
    }

    return { hijacked: false };
  } catch (err) {
    // Network failure during hijack check — don't penalise the proxy.
    log.debug('Hijack check network failure', { error: String(err) });
    return { hijacked: false };
  }
}

// ─── Site-Pass Checks ──────────────────────────────────────────────────────────
// Tests whether a proxy can reach popular sites. Each site has a lightweight
// endpoint that returns a predictable status code — no heavy page loads.

const SITE_CHECKS: Array<{ key: SitePassKey; url: string; pass: (status: number) => boolean }> = [
  { key: 'discord', url: 'https://discord.com/api/v10/gateway', pass: (s) => s === 200 },
  { key: 'tiktok', url: 'https://www.tiktok.com/robots.txt', pass: (s) => s >= 200 && s < 400 },
  { key: 'instagram', url: 'https://www.instagram.com/robots.txt', pass: (s) => s >= 200 && s < 400 },
  { key: 'x', url: 'https://x.com/robots.txt', pass: (s) => s >= 200 && s < 400 },
  { key: 'reddit', url: 'https://www.reddit.com/robots.txt', pass: (s) => s >= 200 && s < 400 },
];

async function checkSitePass(
  httpAgent: Agent,
  httpsAgent: Agent,
  timeoutMs: number,
): Promise<Partial<Record<SitePassKey, boolean>>> {
  const results: Partial<Record<SitePassKey, boolean>> = {};

  await Promise.all(
    SITE_CHECKS.map(async ({ key, url, pass }) => {
      try {
        const res = await axios.get(url, {
          httpAgent,
          httpsAgent,
          timeout: timeoutMs,
          validateStatus: () => true,
          maxRedirects: 3,
        });
        results[key] = pass(res.status);
      } catch {
        results[key] = false;
      }
    }),
  );

  return results;
}

// Hard per-proxy timeout — kills the entire validation if it hangs.
// Axios timeout only covers response wait, not stuck sockets.
const PER_PROXY_HARD_TIMEOUT_MS = 30_000; // 30 seconds max per proxy, no exceptions

async function withHardTimeout<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      log.debug(`Hard timeout hit for ${label}`);
      resolve(fallback);
    }, PER_PROXY_HARD_TIMEOUT_MS);

    fn().then((result) => {
      clearTimeout(timer);
      resolve(result);
    }).catch(() => {
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

export async function validateProxy(proxy: RawProxy): Promise<ValidatedProxy> {
  const proxyId = `${proxy.host}:${proxy.port}`;
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
    last_checked: Math.floor(Date.now() / 1000),
  };

  return withHardTimeout(() => validateProxyInner(proxy, base), base, proxyId);
}

async function validateProxyInner(proxy: RawProxy, base: ValidatedProxy): Promise<ValidatedProxy> {
  const proxyUrl = buildProxyUrl(proxy);
  const proxyId = base.proxy_id;

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
    } catch (judgeErr) {
      log.debug(`Judge unreachable for ${proxyId}, falling back to httpbin`, { error: String(judgeErr) });
      // Judge unreachable — fall back to httpbin
      try {
        await axios.get('http://httpbin.org/ip', {
          httpAgent,
          httpsAgent,
          timeout: config.validator.timeoutMs,
          validateStatus: () => true,
        });
        alive = true;
      } catch (httpbinErr) {
        log.debug(`Both judge and httpbin failed for ${proxyId}`, { error: String(httpbinErr) });
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
    const geoCountry = await lookupCountry(proxy.host);
    const country = geoCountry ?? proxy.country;
    const asn = (await lookupAsn(proxy.host)) ?? undefined;

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
      } catch (googleErr) {
        log.debug(`Google pass check failed for ${proxyId}`, { error: String(googleErr) });
        googlePass = false;
      }
    }

    // ── Site-pass checks ────────────────────────────────────────────
    const sitePass = config.validator.skipSitePass
      ? {}
      : await checkSitePass(httpAgent, httpsAgent, config.validator.timeoutMs);

    return {
      ...base,
      alive: true,
      latency_ms: latency,
      anonymity,
      google_pass: googlePass,
      hijacked: false,
      asn,
      country,
      site_pass: { google: googlePass, ...sitePass },
    };
  } catch (err) {
    log.debug(`Validation failed for ${proxyId}`, { error: String(err) });
    return base;
  }
}

export type OnProxyResult = (result: ValidatedProxy) => void;

export async function validateAll(
  proxies: RawProxy[],
  onResult?: OnProxyResult,
): Promise<ValidatedProxy[]> {
  const limit = pLimit(config.validator.concurrency);

  log.info(`Validating ${proxies.length} proxies`, {
    concurrency: config.validator.concurrency,
    timeout_ms: config.validator.timeoutMs,
  });

  // Pre-warm own IP detection and geo databases
  await Promise.all([getOwnIp(), initGeo(config.geo.mmdbPath), initGeoAsn(config.geo.asnMmdbPath)]);
  // When GeoLite2 is unavailable, batch-fetch all proxy IPs from the free API
  await prewarmFreeGeoCache(proxies.map((p) => p.host));

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

        // Stream result to caller immediately
        if (onResult) onResult(result);

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

    // Race all tasks against a global deadline — don't let a few hanging proxies block forever
    const GLOBAL_TIMEOUT_MS = 150 * 60 * 1000; // 150 minutes max for entire validation
    const deadline = new Promise<void>((resolve) => {
      setTimeout(() => {
        log.warn(`Global validation deadline reached (${GLOBAL_TIMEOUT_MS / 60000} min) — returning ${results.length} results`, {
          completed,
          total: proxies.length,
          alive: aliveCount,
        });
        resolve();
      }, GLOBAL_TIMEOUT_MS);
    });

    await Promise.race([Promise.all(tasks), deadline]);
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
