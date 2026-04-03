// ─── Proxifly Fetcher ─────────────────────────────────────────────────────────
// Fetches proxies from the Proxifly free-proxy-list GitHub repository.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:proxifly');

const URL =
  'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.json';

interface ProxiflyEntry {
  ip: string;
  port: number;
  protocol?: string;
  country?: string;
}

const VALID_PROTOCOLS = new Set<ProxyProtocol>(['http', 'socks4', 'socks5']);

function toProtocol(p: string | undefined): ProxyProtocol {
  if (!p) return 'http';
  const lower = p.toLowerCase();
  if (lower === 'https') return 'http';
  if (VALID_PROTOCOLS.has(lower as ProxyProtocol)) return lower as ProxyProtocol;
  return 'http';
}

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  try {
    const response = await axios.get<ProxiflyEntry[]>(URL, { timeout: 10_000 });
    const items = Array.isArray(response.data) ? response.data : [];

    for (const item of items) {
      const port = typeof item.port === 'number' ? item.port : parseInt(String(item.port), 10);
      if (!item.ip || !port || isNaN(port)) continue;
      results.push({
        host: item.ip.toLowerCase().trim(),
        port,
        protocol: toProtocol(item.protocol),
        country: item.country,
        source: 'proxifly',
      });
    }
  } catch (err) {
    log.error('Failed to fetch proxies', { error: String(err) });
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
