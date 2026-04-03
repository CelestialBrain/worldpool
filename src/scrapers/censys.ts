// ─── Censys Fetcher ───────────────────────────────────────────────────────────
// Queries Censys Search API v2 for open proxy ports.
// Requires CENSYS_API_ID and CENSYS_API_SECRET to be set; returns [] if missing.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

const log = createLogger('scraper:censys');

const SEARCH_URL = 'https://search.censys.io/api/v2/hosts/search';

const QUERIES: Array<{ query: string; protocol: ProxyProtocol }> = [
  { query: 'services.port: 1080 AND services.banner: "SOCKS"', protocol: 'socks5' },
  { query: 'services.port: 8080 AND services.banner: "HTTP"', protocol: 'http' },
  { query: 'services.port: 3128 AND services.banner: "Squid"', protocol: 'http' },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CensysHit {
  ip: string;
  location?: { country?: string };
  services?: Array<{ port?: number }>;
}

interface CensysResponse {
  result?: {
    hits?: CensysHit[];
    links?: { next?: string };
  };
}

export async function scrape(): Promise<RawProxy[]> {
  const { apiId, apiSecret, maxPages } = config.censys;

  if (!apiId || !apiSecret) {
    log.warn('CENSYS_API_ID or CENSYS_API_SECRET is not set — skipping Censys scraper');
    return [];
  }

  const auth = { username: apiId, password: apiSecret };
  const results: RawProxy[] = [];
  const seen = new Set<string>();

  for (const { query, protocol } of QUERIES) {
    let cursor: string | undefined;

    for (let page = 1; page <= maxPages; page++) {
      try {
        const params: Record<string, string> = { q: query };
        if (cursor) params['cursor'] = cursor;

        const response = await axios.get<CensysResponse>(SEARCH_URL, {
          params,
          auth,
          timeout: 15_000,
        });

        const hits: CensysHit[] = response.data?.result?.hits ?? [];

        if (hits.length === 0) break;

        for (const hit of hits) {
          const host = hit.ip?.toLowerCase().trim();
          if (!host) continue;

          // Use the first matched service port; skip if port cannot be determined
          const servicePort = hit.services?.find((s) => s.port)?.port;
          if (!servicePort) continue;

          const key = `${host}:${servicePort}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const country = hit.location?.country ?? undefined;

          results.push({
            host,
            port: servicePort,
            protocol,
            country,
            source: 'censys',
          });
        }

        cursor = response.data?.result?.links?.next;

        // Censys free tier: ~0.4 queries/sec — wait 2.5s between requests
        if (page < maxPages && hits.length > 0) {
          await sleep(2_500);
        }

        if (!cursor) break;
      } catch (err: unknown) {
        log.error(`Failed to fetch Censys query "${query}" page ${page}`, {
          error: String(err),
        });
        break; // stop paginating this query on error
      }
    }
  }

  log.info(`Fetched ${results.length} proxies from Censys`);
  return results;
}
