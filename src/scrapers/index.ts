// ─── Scraper Index ────────────────────────────────────────────────────────────
// Runs all source fetchers in parallel, deduplicates by host:port.
// Each scraper module exports: scrape(): Promise<RawProxy[]>

import { scrape as proxyscrape } from './proxyscrape.js';
import { scrape as geonode } from './geonode.js';
import { scrape as thespeedx } from './thespeedx.js';
import { scrape as proxifly } from './proxifly.js';
import { scrape as shodan } from './shodan.js';
import { scrape as censys } from './censys.js';
import { scrape as scanner } from './scanner/index.js';
import { scrape as monosans } from './monosans.js';
import { scrape as clarketm } from './clarketm.js';
import { scrape as hookzof } from './hookzof.js';
import { scrape as fate0 } from './fate0.js';
import { scrape as sunny9577 } from './sunny9577.js';
import { scrape as ercin } from './ercin.js';
import { scrape as murongpig } from './murongpig.js';
import { scrape as r00tee } from './r00tee.js';
import { scrape as casa } from './casa.js';
import { scrape as jetkai } from './jetkai.js';
import { scrape as mmpx12 } from './mmpx12.js';
import { scrape as vakhov } from './vakhov.js';
import { scrape as iplocate } from './iplocate.js';
import { scrape as zloi } from './zloi.js';
import { scrape as spysme } from './spysme.js';
import { scrape as databay } from './databay.js';
import { scrape as prxchk } from './prxchk.js';
import { scrape as clearproxy } from './clearproxy.js';
import { scrape as dinoz0rg } from './dinoz0rg.js';
import { scrape as proxyscraperGh } from './proxyscraper-gh.js';
import { scrape as zevtyardt } from './zevtyardt.js';
// fyvri removed — repo 404'd, was returning 0 proxies
import { scrape as vmheaven } from './vmheaven.js';
import { scrape as vanndev } from './vanndev.js';
import { scrape as roosterkid } from './roosterkid.js';
import { scrape as freeproxylist } from './freeproxylist.js';
import { scrape as bulkGithub } from './bulk-github.js';
import { scrape as acidvegas } from './acidvegas.js';
import type { RawProxy } from '../types.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scrapers');

const scrapers = [
  { name: 'proxyscrape', fn: proxyscrape },
  { name: 'geonode', fn: geonode },
  { name: 'thespeedx', fn: thespeedx },
  { name: 'proxifly', fn: proxifly },
  { name: 'shodan', fn: shodan },
  { name: 'censys', fn: censys },
  { name: 'scanner', fn: scanner },
  { name: 'monosans', fn: monosans },
  { name: 'clarketm', fn: clarketm },
  { name: 'hookzof', fn: hookzof },
  { name: 'fate0', fn: fate0 },
  { name: 'sunny9577', fn: sunny9577 },
  { name: 'ercin', fn: ercin },
  { name: 'murongpig', fn: murongpig },
  { name: 'r00tee', fn: r00tee },
  { name: 'casa', fn: casa },
  { name: 'jetkai', fn: jetkai },
  { name: 'mmpx12', fn: mmpx12 },
  { name: 'vakhov', fn: vakhov },
  { name: 'iplocate', fn: iplocate },
  { name: 'zloi', fn: zloi },
  { name: 'spysme', fn: spysme },
  { name: 'databay', fn: databay },
  { name: 'prxchk', fn: prxchk },
  { name: 'clearproxy', fn: clearproxy },
  { name: 'dinoz0rg', fn: dinoz0rg },
  { name: 'proxyscraper-gh', fn: proxyscraperGh },
  { name: 'zevtyardt', fn: zevtyardt },
  // fyvri removed — repo 404'd
  { name: 'vmheaven', fn: vmheaven },
  { name: 'vanndev', fn: vanndev },
  { name: 'roosterkid', fn: roosterkid },
  { name: 'freeproxylist', fn: freeproxylist },
  { name: 'bulk-github', fn: bulkGithub },
  { name: 'acidvegas', fn: acidvegas },
];

export async function scrapeAll(): Promise<RawProxy[]> {
  const MAX_PER_SOURCE = config.scraper.maxPerSource;

  const results = await Promise.allSettled(scrapers.map(s => s.fn()));
  const allProxies: RawProxy[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      let proxies = result.value;
      if (proxies.length > MAX_PER_SOURCE) {
        log.warn(`Source ${scrapers[i].name} returned ${proxies.length} proxies — capping at ${MAX_PER_SOURCE}`);
        proxies = proxies.slice(0, MAX_PER_SOURCE);
      }
      log.info(`Source ${scrapers[i].name}: ${proxies.length} proxies`);
      for (const proxy of proxies) {
        allProxies.push(proxy);
      }
    } else {
      log.error(`Source ${scrapers[i].name} failed`, { reason: String(result.reason) });
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
