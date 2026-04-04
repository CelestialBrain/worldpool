// ─── Free-Proxy-List.net Family Fetcher ───────────────────────────────────────
// Scrapes HTML tables from free-proxy-list.net, sslproxies.org,
// us-proxy.org, and socks-proxy.net. ~300 proxies each, updated every 10 min.
// Uses regex parsing — no HTML parser dependency needed.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:freeproxylist');

const SOURCES: Array<{ url: string; defaultProtocol: ProxyProtocol }> = [
  { url: 'https://free-proxy-list.net/', defaultProtocol: 'http' },
  { url: 'https://www.sslproxies.org/', defaultProtocol: 'http' },
  { url: 'https://www.us-proxy.org/', defaultProtocol: 'http' },
  { url: 'https://www.socks-proxy.net/', defaultProtocol: 'socks4' },
];

// These sites embed proxies in a <textarea> with host:port per line,
// or in table rows. Extract both patterns.
const IP_PORT_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})/g;

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  for (const { url, defaultProtocol } of SOURCES) {
    try {
      const res = await axios.get<string>(url, {
        timeout: 15_000,
        responseType: 'text',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Worldpool/1.0)' },
      });

      const html = res.data as string;
      let match: RegExpExecArray | null;
      const seen = new Set<string>();

      while ((match = IP_PORT_RE.exec(html)) !== null) {
        const host = match[1];
        const port = parseInt(match[2], 10);
        const key = `${host}:${port}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (host && port && !isNaN(port) && port > 0 && port <= 65535) {
          // Detect SOCKS from socks-proxy.net
          let protocol = defaultProtocol;
          if (url.includes('socks-proxy')) {
            // Check if the row mentions Socks5
            const idx = html.indexOf(key);
            if (idx !== -1) {
              const context = html.slice(idx, idx + 200).toLowerCase();
              if (context.includes('socks5')) protocol = 'socks5';
            }
          }
          results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'freeproxylist' });
        }
      }
    } catch (err) {
      log.error(`Failed to fetch from ${url}`, { error: String(err) });
    }
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
