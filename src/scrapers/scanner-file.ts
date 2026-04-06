// ─── Scanner File Fetcher ─────────────────────────────────────────────────────
// Reads proxies discovered by the VPS scanner from data/scanner-discovered.txt.
// The scanner runs on a Hetzner VPS and pushes results to this file.
// Format: host:port per line (already fingerprinted as valid proxy protocol).

import { readFileSync, existsSync } from 'fs';
import type { RawProxy } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:scanner-file');

const FILE_PATH = 'data/scanner-discovered.txt';

export async function scrape(): Promise<RawProxy[]> {
  if (!existsSync(FILE_PATH)) {
    log.debug('No scanner-discovered.txt found — skipping');
    return [];
  }

  const results: RawProxy[] = [];
  const content = readFileSync(FILE_PATH, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  for (const line of lines) {
    const [host, portStr] = line.split(':');
    const port = parseInt(portStr, 10);
    if (!host || !port || isNaN(port) || port < 1 || port > 65535) continue;

    // Guess protocol from port
    let protocol: RawProxy['protocol'] = 'http';
    if (port === 1080) protocol = 'socks5';
    else if (port === 4145 || port === 4153) protocol = 'socks4';

    results.push({ host: host.toLowerCase().trim(), port, protocol, source: 'scanner' });
  }

  log.info(`Loaded ${results.length} scanner-discovered proxies from ${FILE_PATH}`);
  return results;
}
