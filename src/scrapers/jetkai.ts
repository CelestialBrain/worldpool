// ─── Jetkai Fetcher ───────────────────────────────────────────────────────────
// ~3k+ proxies, hourly updates. One of the most starred proxy list repos.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:jetkai');

const BASE = 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt';

const SOURCES: Array<{ url: string; protocol: ProxyProtocol }> = [
  { url: `${BASE}/proxies-http.txt`, protocol: 'http' },
  { url: `${BASE}/proxies-socks4.txt`, protocol: 'socks4' },
  { url: `${BASE}/proxies-socks5.txt`, protocol: 'socks5' },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  for (const { url, protocol } of SOURCES) {
    try {
      const response = await axios.get<string>(url, { timeout: 15_000, responseType: 'text' });
      const lines = (response.data as string).split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));

      for (const line of lines) {
        const [host, portStr] = line.split(':');
        const port = parseInt(portStr, 10);
        if (!host || !port || isNaN(port)) continue;
        results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'jetkai' });
      }
    } catch (err) {
      log.error(`Failed to fetch ${protocol} proxies`, { url, error: String(err) });
    }
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
