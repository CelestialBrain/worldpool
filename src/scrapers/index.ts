// ─── Scraper Index ────────────────────────────────────────────────────────────
// Runs all source fetchers in parallel, deduplicates by host:port.
// Each scraper module exports: scrape(): Promise<RawProxy[]>

// TODO: import { scrape as proxyscrape } from './proxyscrape.js';
// TODO: import { scrape as geonode } from './geonode.js';
// TODO: import { scrape as thespeedx } from './thespeedx.js';
// TODO: import { scrape as proxifly } from './proxifly.js';

import type { RawProxy } from '../types.js';

export async function scrapeAll(): Promise<RawProxy[]> {
  // TODO: implement
  throw new Error('Not implemented');
}
