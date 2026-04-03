// ─── Pipeline Service ─────────────────────────────────────────────────────────
// Orchestrates the full pipeline: scrape → validate → store → export.
// Called by GitHub Actions (npm run pipeline) and the /refresh endpoint.

import { scrapeAll } from '../scrapers/index.js';
import { validateAll } from './validator.js';
import { upsertProxy } from '../models/proxy.js';
import { exportFiles, updateReadmeStats } from './exporter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('pipeline');

export async function runPipeline(): Promise<void> {
  const pipelineStart = Date.now();
  log.info('Pipeline started');

  // Step 1: Scrape
  log.info('Step 1/4: Scraping proxies...');
  const raw = await scrapeAll();
  log.info(`Scraped ${raw.length} proxies`);

  // Step 2: Validate
  log.info('Step 2/4: Validating proxies...');
  const validated = await validateAll(raw);
  const aliveCount = validated.filter((p) => p.alive).length;
  log.info(`Validated: ${validated.length} total, ${aliveCount} alive`);

  // Step 3: Store
  log.info('Step 3/4: Storing proxies...');
  upsertProxy(validated);
  log.info(`Stored ${validated.length} proxies`);

  // Step 4: Export
  log.info('Step 4/4: Exporting files...');
  try {
    await exportFiles();
  } catch (err) {
    log.error('Export failed', { error: String(err) });
  }
  try {
    await updateReadmeStats();
  } catch (err) {
    log.error('README update failed', { error: String(err) });
  }

  const elapsed = Date.now() - pipelineStart;
  log.info(`Pipeline complete`, { elapsed_ms: elapsed, alive_count: aliveCount });
}
