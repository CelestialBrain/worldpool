// ─── Databay Fetcher ──────────────────────────────────────────────────────────
// Free API, ~7.5k proxies, updated every 10 minutes. No auth required.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:databay');

const SOURCES: Array<{ url: string; protocol: ProxyProtocol }> = [
  { url: 'https://databay.com/api/v1/proxy-list?protocol=http&format=txt', protocol: 'http' },
  { url: 'https://databay.com/api/v1/proxy-list?protocol=socks4&format=txt', protocol: 'socks4' },
  { url: 'https://databay.com/api/v1/proxy-list?protocol=socks5&format=txt', protocol: 'socks5' },
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
        results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'databay' });
      }
    } catch (err) {
      log.error(`Failed to fetch ${protocol} proxies`, { url, error: String(err) });
    }
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
