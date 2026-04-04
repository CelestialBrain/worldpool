// ─── Zloi-user Fetcher ────────────────────────────────────────────────────────
// Format: host:port:country per line. Updated every 10 minutes.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:zloi');

const BASE = 'https://raw.githubusercontent.com/zloi-user/hideip.me/main';

const SOURCES: Array<{ url: string; protocol: ProxyProtocol }> = [
  { url: `${BASE}/http.txt`, protocol: 'http' },
  { url: `${BASE}/https.txt`, protocol: 'http' },
  { url: `${BASE}/socks4.txt`, protocol: 'socks4' },
  { url: `${BASE}/socks5.txt`, protocol: 'socks5' },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  for (const { url, protocol } of SOURCES) {
    try {
      const response = await axios.get<string>(url, { timeout: 15_000, responseType: 'text' });
      const lines = (response.data as string).split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));

      for (const line of lines) {
        // Format: host:port:country (country is optional free text)
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const host = parts[0];
        const port = parseInt(parts[1], 10);
        if (!host || !port || isNaN(port)) continue;
        results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'zloi' });
      }
    } catch (err) {
      log.error(`Failed to fetch ${protocol} proxies`, { url, error: String(err) });
    }
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
