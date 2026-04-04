// ─── Clarketm Fetcher ─────────────────────────────────────────────────────────
// Fetches proxies from clarketm/proxy-list GitHub raw file.
// Format: host:port per line (HTTP only — no protocol metadata).

import axios from 'axios';
import type { RawProxy } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:clarketm');

const URL =
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt';

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  try {
    const response = await axios.get<string>(URL, {
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
      results.push({ host: host.toLowerCase().trim(), port, protocol: 'http', source: 'clarketm' });
    }
  } catch (err) {
    log.error('Failed to fetch proxies', { error: String(err) });
  }

  log.info(`Fetched ${results.length} proxies`);
  return results;
}
