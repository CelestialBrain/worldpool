// ─── Geolocator Service ───────────────────────────────────────────────────────
// Offline IP geolocation using MaxMind GeoLite2-Country and GeoLite2-ASN
// databases. Call initGeo()/initGeoAsn() once at startup; then use
// lookupCountry()/lookupAsn() anywhere.
//
// When GeoLite2 databases are not present, the service automatically falls back
// to the ip-api.com free API (no key, 45 req/min). Results are cached in-memory
// to avoid re-querying the same IP during a pipeline run.

import { existsSync } from 'fs';
import maxmind, { type CountryResponse, type AsnResponse, type Reader } from 'maxmind';
import { createLogger } from '../utils/logger.js';

const log = createLogger('geolocator');

let reader: Reader<CountryResponse> | null = null;
let asnReader: Reader<AsnResponse> | null = null;

// ─── Free API fallback (ip-api.com) ─────────────────────────────────────────

interface GeoCacheEntry {
  country: string | null;
  asn: string | null;
}

/** In-memory cache shared across both country and ASN lookups. */
const geoCache = new Map<string, GeoCacheEntry>();

// ip-api.com: free for non-commercial use, max 100 IPs per batch, 45 batch req/min
const IP_API_BATCH_URL = 'http://ip-api.com/batch';
const IP_API_BATCH_DELAY_MS = 1_500; // 40 batch requests/min — safely under the 45 batch req/min limit
const IP_API_TIMEOUT_MS = 10_000;

interface IpApiItem {
  query: string;
  status: 'success' | 'fail';
  countryCode?: string;
  as?: string; // e.g. "AS15169 Google LLC"
}

async function fetchIpApiBatch(ips: string[]): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IP_API_TIMEOUT_MS);

  try {
    const body = JSON.stringify(
      ips.map((q) => ({ query: q, fields: 'status,countryCode,as,query' })),
    );

    const res = await fetch(IP_API_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!res.ok) return;

    const data = (await res.json()) as IpApiItem[];
    for (const item of data) {
      const asnStr = item.as ? item.as.split(' ')[0] : null; // "AS15169 Google LLC" → "AS15169"
      geoCache.set(item.query, {
        country: item.status === 'success' ? (item.countryCode ?? null) : null,
        asn: item.status === 'success' ? asnStr : null,
      });
    }
  } catch {
    // Network error or timeout — leave IPs uncached; lookups will return null.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pre-warm the in-memory geo cache for a list of IPs using the ip-api.com free
 * API. No-op when both GeoLite2 databases are already loaded (they're faster).
 * Sends requests in batches of 100 with rate-limiting (ip-api.com: 45 batch
 * req/min; each batch covers up to 100 IPs).
 *
 * Call this once in validateAll() before per-proxy lookups begin so that
 * lookupCountryFree/lookupAsnFree hit the cache rather than making individual
 * network requests per proxy.
 */
export async function prewarmFreeGeoCache(ips: string[]): Promise<void> {
  if (reader !== null && asnReader !== null) return;

  const unique = [...new Set(ips)].filter((ip) => !geoCache.has(ip));
  if (unique.length === 0) return;

  log.info(`Pre-warming free geo cache for ${unique.length} IPs via ip-api.com`);

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    await fetchIpApiBatch(batch);
    if (i + 100 < unique.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, IP_API_BATCH_DELAY_MS));
    }
  }

  log.info(`Free geo cache populated`, { entries: geoCache.size });
}

async function lookupCountryFree(ip: string): Promise<string | null> {
  if (!geoCache.has(ip)) await fetchIpApiBatch([ip]);
  return geoCache.get(ip)?.country ?? null;
}

async function lookupAsnFree(ip: string): Promise<string | null> {
  if (!geoCache.has(ip)) await fetchIpApiBatch([ip]);
  return geoCache.get(ip)?.asn ?? null;
}

/**
 * Load the MaxMind GeoLite2-Country .mmdb database from disk.
 * If the file is missing, logs a warning and leaves lookups returning null.
 * Safe to call multiple times — subsequent calls are no-ops once loaded.
 */
export async function initGeo(dbPath: string): Promise<void> {
  if (reader !== null) return;

  if (!existsSync(dbPath)) {
    log.warn('GeoLite2 .mmdb not found — will use free API fallback', { dbPath });
    return;
  }

  try {
    reader = await maxmind.open<CountryResponse>(dbPath);
    log.info('GeoLite2 database loaded', { dbPath });
  } catch (err) {
    log.warn('Failed to load GeoLite2 database — will use free API fallback', {
      dbPath,
      error: String(err),
    });
  }
}

/**
 * Load the MaxMind GeoLite2-ASN .mmdb database from disk.
 * If the file is missing, logs a warning and leaves ASN lookups returning null.
 * Safe to call multiple times — subsequent calls are no-ops once loaded.
 */
export async function initGeoAsn(dbPath: string): Promise<void> {
  if (asnReader !== null) return;

  if (!existsSync(dbPath)) {
    log.warn('GeoLite2-ASN .mmdb not found — will use free API fallback', { dbPath });
    return;
  }

  try {
    asnReader = await maxmind.open<AsnResponse>(dbPath);
    log.info('GeoLite2-ASN database loaded', { dbPath });
  } catch (err) {
    log.warn('Failed to load GeoLite2-ASN database — will use free API fallback', {
      dbPath,
      error: String(err),
    });
  }
}

/**
 * Look up the ISO 3166-1 alpha-2 country code for an IP address.
 * Uses GeoLite2 if loaded; otherwise falls back to the ip-api.com free API.
 * Returns null if the lookup fails.
 */
export async function lookupCountry(ip: string): Promise<string | null> {
  if (reader !== null) {
    try {
      const result = reader.get(ip);
      return result?.country?.iso_code ?? null;
    } catch {
      return null;
    }
  }
  return lookupCountryFree(ip);
}

/**
 * Look up the ASN for an IP address (e.g. "AS12345").
 * Uses GeoLite2 if loaded; otherwise falls back to the ip-api.com free API.
 * Returns null if the lookup fails.
 */
export async function lookupAsn(ip: string): Promise<string | null> {
  if (asnReader !== null) {
    try {
      const result = asnReader.get(ip);
      const num = result?.autonomous_system_number;
      return num != null ? `AS${num}` : null;
    } catch {
      return null;
    }
  }
  return lookupAsnFree(ip);
}
