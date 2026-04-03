// ─── Geolocator Service ───────────────────────────────────────────────────────
// Offline IP geolocation using MaxMind GeoLite2-Country database.
// Call initGeo() once at startup; then use lookupCountry() anywhere.

import { existsSync } from 'fs';
import maxmind, { type CountryResponse, type Reader } from 'maxmind';
import { createLogger } from '../utils/logger.js';

const log = createLogger('geolocator');

let reader: Reader<CountryResponse> | null = null;

/**
 * Load the MaxMind GeoLite2-Country .mmdb database from disk.
 * If the file is missing, logs a warning and leaves lookups returning null.
 * Safe to call multiple times — subsequent calls are no-ops once loaded.
 */
export async function initGeo(dbPath: string): Promise<void> {
  if (reader !== null) return;

  if (!existsSync(dbPath)) {
    log.warn('GeoLite2 .mmdb not found — country lookup disabled', { dbPath });
    return;
  }

  try {
    reader = await maxmind.open<CountryResponse>(dbPath);
    log.info('GeoLite2 database loaded', { dbPath });
  } catch (err) {
    log.warn('Failed to load GeoLite2 database — country lookup disabled', {
      dbPath,
      error: String(err),
    });
  }
}

/**
 * Look up the ISO 3166-1 alpha-2 country code for an IP address.
 * Returns null if the database is not loaded or the IP is not found.
 */
export function lookupCountry(ip: string): string | null {
  if (reader === null) return null;

  try {
    const result = reader.get(ip);
    return result?.country?.iso_code ?? null;
  } catch {
    return null;
  }
}
