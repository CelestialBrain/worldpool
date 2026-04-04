// ─── Sunny9577 Fetcher ────────────────────────────────────────────────────────
// Fetches proxies from sunny9577/proxy-scraper GitHub raw files.
// Format: host:port per line, separate files per protocol.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:sunny9577');

const BASE = 'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated';

const SOURCES: Array<{ url: string; protocol: ProxyProtocol }> = [
  { url: `${BASE}/http_proxies.txt`, protocol: 'http' },
  { url: `${BASE}/socks4_proxies.txt`, protocol: 'socks4' },
  { url: `${BASE}/socks5_proxies.txt`, protocol: 'socks5' },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  for (const { url, protocol } of SOURCES) {
    try {
      const response = await axios.get<string>(url, {
        timeout: 10_000,
        responseType: 'text',
      });

      const lines = (response.data as string)
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

      for (const line of lines) {
        const [host, portStr] = line.split(':');
        const port = parseInt(portStr, 10);
        if (!host || !port || isNaN(port)) continue;
        results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'sunny9577' });
      }
    } catch (err) {
      log.error(`Failed to fetch ${protocol} proxies`, { url, error: String(err) });
    }
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
