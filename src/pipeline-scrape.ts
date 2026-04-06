// ─── Scrape Phase ─────────────────────────────────────────────────────────────
// Phase 1 of the parallel pipeline. Scrapes all sources, deduplicates,
// applies blacklist, writes the proxy list to a JSON file for sharded validation.
// Usage: npm run pipeline:scrape

import { scrapeAll } from './scrapers/index.js';
import { getRecentlyDeadProxyIds } from './models/proxy.js';
import { writeFileSync, mkdirSync } from 'fs';
import { config } from './config.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('pipeline:scrape');

async function main() {
  log.info('Scrape phase started');

  const raw = await scrapeAll();
  if (raw.length === 0) {
    log.error('All scrapers returned zero proxies — aborting');
    process.exit(1);
  }
  log.info(`Scraped ${raw.length} proxies`);

  // Apply blacklist
  let toValidate = raw;
  try {
    const blacklistSec = config.scraper.blacklistWindowSec;
    const recentlyDead = getRecentlyDeadProxyIds(blacklistSec);
    if (recentlyDead.size > 0) {
      toValidate = raw.filter(p => !recentlyDead.has(`${p.host}:${p.port}`));
      const skipped = raw.length - toValidate.length;
      log.info(`Blacklist: skipping ${skipped} recently-dead proxies`, {
        scraped: raw.length,
        after_blacklist: toValidate.length,
      });
    }
  } catch (err) {
    log.warn('Blacklist query failed (first run?) — validating all', { error: String(err) });
  }

  // Write proxy list for sharded validators to pick up
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/proxies-to-validate.json', JSON.stringify(toValidate));
  log.info(`Wrote ${toValidate.length} proxies to artifacts/proxies-to-validate.json`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('Scrape phase failed', { error: String(err) });
    process.exit(1);
  });
