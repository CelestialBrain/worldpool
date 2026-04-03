// ─── ProxyScrape Fetcher ──────────────────────────────────────────────────────
// Fetches proxies from the ProxyScrape v2 text endpoint.

import axios from 'axios';
import type { RawProxy } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:proxyscrape');

const ENDPOINTS: Array<{ url: string; protocol: RawProxy['protocol'] }> = [
  {
    url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
    protocol: 'http',
  },
  {
    url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all',
    protocol: 'socks4',
  },
  {
    url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all',
    protocol: 'socks5',
  },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  for (const { url, protocol } of ENDPOINTS) {
    try {
      const response = await axios.get<string>(url, {
        timeout: 10_000,
        responseType: 'text',
      });
      const lines = (response.data as string)
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      for (const line of lines) {
        const [host, portStr] = line.split(':');
        const port = parseInt(portStr, 10);
        if (!host || !port || isNaN(port)) continue;
        results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'proxyscrape' });
      }
    } catch (err) {
      log.error(`Failed to fetch ${protocol} proxies`, { url, error: String(err) });
    }
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
