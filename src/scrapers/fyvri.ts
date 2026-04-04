// ─── Fyvri Fetcher ────────────────────────────────────────────────────────────
// ~8-15k proxies per file. Hourly updates. Multiple formats available.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:fyvri');
// Use main branch (current), not archive (historical dumps of 500k+)
const BASE = 'https://raw.githubusercontent.com/fyvri/fresh-proxy-list/main/storage/classic';
const SOURCES: Array<{ url: string; protocol: ProxyProtocol }> = [
  { url: `${BASE}/http.txt`, protocol: 'http' },
  { url: `${BASE}/socks4.txt`, protocol: 'socks4' },
  { url: `${BASE}/socks5.txt`, protocol: 'socks5' },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];
  for (const { url, protocol } of SOURCES) {
    try {
      const res = await axios.get<string>(url, { timeout: 15_000, responseType: 'text' });
      for (const line of (res.data as string).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) {
        const [host, portStr] = line.split(':');
        const port = parseInt(portStr, 10);
        if (host && port && !isNaN(port)) results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'fyvri' });
      }
    } catch (err) { log.error(`Failed ${protocol}`, { error: String(err) }); }
  }
  log.info(`Fetched ${results.length} proxies`);
  return results;
}
