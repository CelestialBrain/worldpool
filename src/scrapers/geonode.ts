// ─── Geonode Fetcher ──────────────────────────────────────────────────────────
// Fetches proxies from the Geonode public API.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:geonode');

const BASE_URL = 'https://proxylist.geonode.com/api/proxy-list';
const LIMIT = 500;

interface GeonodeProxy {
  ip: string;
  port: string;
  protocols: string[];
  country?: string;
}

interface GeonodeResponse {
  data: GeonodeProxy[];
  total: number;
  page: number;
  limit: number;
}

const VALID_PROTOCOLS = new Set<ProxyProtocol>(['http', 'socks4', 'socks5']);

function toProtocol(p: string): ProxyProtocol | null {
  const lower = p.toLowerCase();
  if (lower === 'https') return 'http';
  if (VALID_PROTOCOLS.has(lower as ProxyProtocol)) return lower as ProxyProtocol;
  return null;
}

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  try {
    const response = await axios.get<GeonodeResponse>(BASE_URL, {
      params: {
        limit: LIMIT,
        page: 1,
        sort_by: 'lastChecked',
        sort_type: 'desc',
      },
      timeout: 10_000,
    });

    const items = response.data?.data ?? [];
    for (const item of items) {
      const port = parseInt(item.port, 10);
      if (!item.ip || !port || isNaN(port)) continue;

      for (const proto of item.protocols ?? []) {
        const protocol = toProtocol(proto);
        if (!protocol) continue;
        results.push({
          host: item.ip.toLowerCase().trim(),
          port,
          protocol,
          country: item.country,
          source: 'geonode',
        });
      }
    }
  } catch (err) {
    log.error('Failed to fetch proxies', { error: String(err) });
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
