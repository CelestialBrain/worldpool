// ─── ClearProxy Fetcher ───────────────────────────────────────────────────────
// Updated every 5 minutes. Verified proxies (~800+).

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:clearproxy');
const BASE = 'https://raw.githubusercontent.com/ClearProxy/checked-proxy-list/main';
const SOURCES: Array<{ url: string; protocol: ProxyProtocol }> = [
  { url: `${BASE}/http/raw/all.txt`, protocol: 'http' },
  { url: `${BASE}/socks4/raw/all.txt`, protocol: 'socks4' },
  { url: `${BASE}/socks5/raw/all.txt`, protocol: 'socks5' },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];
  for (const { url, protocol } of SOURCES) {
    try {
      const res = await axios.get<string>(url, { timeout: 15_000, responseType: 'text' });
      for (const line of (res.data as string).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) {
        const [host, portStr] = line.split(':');
        const port = parseInt(portStr, 10);
        if (host && port && !isNaN(port)) results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'clearproxy' });
      }
    } catch (err) { log.error(`Failed ${protocol}`, { error: String(err) }); }
  }
  log.info(`Fetched ${results.length} proxies`);
  return results;
}
