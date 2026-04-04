// ─── Fate0 Fetcher ────────────────────────────────────────────────────────────
// Fetches proxies from fate0/proxylist GitHub raw file.
// Format: JSONL — one JSON object per line with host, port, type, country.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:fate0');

const URL =
  'https://raw.githubusercontent.com/fate0/proxylist/master/proxy.list';

const VALID_PROTOCOLS = new Set<ProxyProtocol>(['http', 'socks4', 'socks5']);

interface Fate0Entry {
  host: string;
  port: number;
  type?: string;
  country?: string;
}

function toProtocol(t: string | undefined): ProxyProtocol {
  if (!t) return 'http';
  const lower = t.toLowerCase();
  if (lower === 'https') return 'http';
  if (VALID_PROTOCOLS.has(lower as ProxyProtocol)) return lower as ProxyProtocol;
  return 'http';
}

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  try {
    const response = await axios.get<string>(URL, {
      timeout: 15_000,
      responseType: 'text',
    });

    const lines = (response.data as string)
      .split('\n')
      .filter((l) => l.trim().length > 0);

    for (const line of lines) {
      try {
        const entry: Fate0Entry = JSON.parse(line);
        const port = typeof entry.port === 'number' ? entry.port : parseInt(String(entry.port), 10);
        if (!entry.host || !port || isNaN(port)) continue;
        results.push({
          host: entry.host.toLowerCase().trim(),
          port,
          protocol: toProtocol(entry.type),
          country: entry.country,
          source: 'fate0',
        });
      } catch {
        // skip malformed lines
      }
    }
  } catch (err) {
    log.error('Failed to fetch proxies', { error: String(err) });
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
