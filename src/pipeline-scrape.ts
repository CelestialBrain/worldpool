// ─── Scrape Phase ─────────────────────────────────────────────────────────────
// Phase 1 of the parallel pipeline. Scrapes all sources, deduplicates,
// applies blacklist, writes the proxy list to a JSON file for sharded validation.
// Usage: npm run pipeline:scrape

import { scrapeAll } from './scrapers/index.js';
import { getRecentlyDeadProxyIds, getPreviouslyAliveProxies } from './models/proxy.js';
import { writeFileSync, mkdirSync } from 'fs';
import { config } from './config.js';
import type { RawProxy, ProxyProtocol } from './types.js';
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

  // Inject previously-alive proxies from DB — they must be re-validated
  // even if they dropped off source lists
  let combined = raw;
  try {
    const aliveFromDb = getPreviouslyAliveProxies();
    if (aliveFromDb.length > 0) {
      const scraped = new Set(raw.map(p => `${p.host}:${p.port}`));
      let injected = 0;
      for (const p of aliveFromDb) {
        if (!scraped.has(p.proxy_id)) {
          combined.push({
            host: p.host,
            port: p.port,
            protocol: p.protocol as ProxyProtocol,
            country: p.country ?? undefined,
            source: p.source ?? undefined,
          });
          injected++;
        }
      }
      if (injected > 0) {
        log.info(`Injected ${injected} previously-alive proxies not in source lists`, {
          from_db: aliveFromDb.length,
          already_in_scrape: aliveFromDb.length - injected,
          injected,
        });
      }
    }
  } catch (err) {
    log.warn('Failed to inject alive proxies from DB (first run?)', { error: String(err) });
  }

  // Apply blacklist — skip recently-dead proxies
  let toValidate = combined;
  try {
    const blacklistSec = config.scraper.blacklistWindowSec;
    const recentlyDead = getRecentlyDeadProxyIds(blacklistSec);
    if (recentlyDead.size > 0) {
      toValidate = combined.filter(p => !recentlyDead.has(`${p.host}:${p.port}`));
      const skipped = combined.length - toValidate.length;
      log.info(`Blacklist: skipping ${skipped} recently-dead proxies`, {
        total: combined.length,
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
