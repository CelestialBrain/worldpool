// ─── Spys.me Fetcher ──────────────────────────────────────────────────────────
// Format: "host:port CC-A[S] +" where CC=country, A=anonymity, S=ssl, +=google
// ~400 proxies per file. Two files: proxy.txt (HTTP) and socks.txt (SOCKS).

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:spysme');

const SOURCES: Array<{ url: string; defaultProtocol: ProxyProtocol }> = [
  { url: 'https://spys.me/proxy.txt', defaultProtocol: 'http' },
  { url: 'https://spys.me/socks.txt', defaultProtocol: 'socks5' },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  for (const { url, defaultProtocol } of SOURCES) {
    try {
      const response = await axios.get<string>(url, { timeout: 15_000, responseType: 'text' });
      const lines = (response.data as string).split('\n').map(l => l.trim()).filter(l => l.length > 0);

      for (const line of lines) {
        // Skip header/footer lines that don't start with a digit
        if (!/^\d/.test(line)) continue;

        // Extract host:port from the start of the line
        const match = line.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)/);
        if (!match) continue;

        const host = match[1];
        const port = parseInt(match[2], 10);
        if (!host || !port || isNaN(port)) continue;

        // Extract country code if present (e.g., "US-H" or "CN-N!")
        const ccMatch = line.match(/\s+([A-Z]{2})-/);
        const country = ccMatch ? ccMatch[1] : undefined;

        results.push({ host: host.toLowerCase().trim(), port, protocol: defaultProtocol, country, source: 'spysme' });
      }
    } catch (err) {
      log.error(`Failed to fetch proxies`, { url, error: String(err) });
    }
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
