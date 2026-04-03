// ─── Scraper Index ────────────────────────────────────────────────────────────
// Runs all source fetchers in parallel, deduplicates by host:port.
// Each scraper module exports: scrape(): Promise<RawProxy[]>

import { scrape as proxyscrape } from './proxyscrape.js';
import { scrape as geonode } from './geonode.js';
import { scrape as thespeedx } from './thespeedx.js';
import { scrape as proxifly } from './proxifly.js';
import { scrape as shodan } from './shodan.js';
import { scrape as censys } from './censys.js';
import type { RawProxy } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scrapers');

export async function scrapeAll(): Promise<RawProxy[]> {
  const results = await Promise.allSettled([
    proxyscrape(),
    geonode(),
    thespeedx(),
    proxifly(),
    shodan(),
    censys(),
  ]);

  const sourceNames = ['proxyscrape', 'geonode', 'thespeedx', 'proxifly', 'shodan', 'censys'];
  const allProxies: RawProxy[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      log.info(`Source ${sourceNames[i]}: ${result.value.length} proxies`);
      allProxies.push(...result.value);
    } else {
      log.error(`Source ${sourceNames[i]} failed`, { reason: String(result.reason) });
    }
  }

  // Deduplicate by host:port — normalize host to lowercase, first-seen wins
  const seen = new Map<string, RawProxy>();
  for (const proxy of allProxies) {
    const key = `${proxy.host.toLowerCase().trim()}:${proxy.port}`;
    if (!seen.has(key)) {
      seen.set(key, proxy);
    }
  }

  const deduped = Array.from(seen.values());
  log.info(`Total after dedup: ${deduped.length} (from ${allProxies.length} raw)`);
  return deduped;
}
