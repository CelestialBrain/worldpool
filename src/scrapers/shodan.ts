// ─── Shodan Fetcher ───────────────────────────────────────────────────────────
// Queries Shodan's host search API for open proxy ports.
// Requires SHODAN_API_KEY to be set; gracefully returns [] if missing.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

const log = createLogger('scraper:shodan');

const BASE_URL = 'https://api.shodan.io/shodan/host/search';

const QUERIES: Array<{ query: string; protocol: ProxyProtocol }> = [
  { query: 'port:1080', protocol: 'socks5' },
  { query: 'port:4145', protocol: 'socks4' },
  { query: 'port:8080 "HTTP Proxy"', protocol: 'http' },
  { query: 'port:8080 "Via:"', protocol: 'http' },
  { query: 'port:3128', protocol: 'http' },
  { query: 'port:8888', protocol: 'http' },
];

function portToProtocol(port: number): ProxyProtocol {
  if (port === 1080) return 'socks5';
  if (port === 4145) return 'socks4';
  return 'http';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrape(): Promise<RawProxy[]> {
  const { apiKey, maxPages } = config.shodan;

  if (!apiKey) {
    log.warn('SHODAN_API_KEY is not set — skipping Shodan scraper');
    return [];
  }

  const results: RawProxy[] = [];
  const seen = new Set<string>();

  for (const { query, protocol } of QUERIES) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const response = await axios.get(BASE_URL, {
          params: { key: apiKey, query, page },
          timeout: 15_000,
        });

        const matches: Array<{ ip_str: string; port: number; location?: { country_code?: string } }> =
          response.data?.matches ?? [];

        if (matches.length === 0) break;

        for (const match of matches) {
          const host = match.ip_str?.toLowerCase().trim();
          const port = match.port;
          if (!host || !port || isNaN(port)) continue;

          const key = `${host}:${port}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const resolvedProtocol = portToProtocol(port);
          const country = match.location?.country_code ?? undefined;

          results.push({ host, port, protocol: resolvedProtocol, country, source: 'shodan' });
        }

        // Shodan free tier: 1 query/sec — wait before next page
        if (page < maxPages && matches.length > 0) {
          await sleep(1_000);
        }
      } catch (err: unknown) {
        log.error(`Failed to fetch Shodan query "${query}" page ${page}`, {
          error: String(err),
        });
        break; // stop paginating this query on error
      }
    }
  }

  log.info(`Fetched ${results.length} proxies from Shodan`);
  return results;
}
