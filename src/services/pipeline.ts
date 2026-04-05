// ─── Pipeline Service ─────────────────────────────────────────────────────────
// Orchestrates the full pipeline: scrape → validate → [tendril] → store → export.
// Called by GitHub Actions (npm run pipeline) and the /refresh endpoint.

import { scrapeAll } from '../scrapers/index.js';
import { validateAll } from './validator.js';
import { upsertProxy } from '../models/proxy.js';
import { exportFiles, updateReadmeStats } from './exporter.js';
import { initStreamExport, streamResult } from './stream-export.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('pipeline');

export async function runPipeline(): Promise<void> {
  const pipelineStart = Date.now();
  log.info('Pipeline started');

  // Step 1: Scrape
  log.info('Step 1/5: Scraping proxies...');
  const raw = await scrapeAll();
  if (raw.length === 0) {
    log.error('All scrapers returned zero proxies — aborting pipeline');
    return;
  }
  log.info(`Scraped ${raw.length} proxies`);

  // Step 2: Validate (local) — stream results to text files as they come in
  log.info('Step 2/5: Validating proxies...');
  initStreamExport();
  const validated = await validateAll(raw, streamResult);
  const aliveCount = validated.filter((p) => p.alive).length;
  if (aliveCount === 0) {
    log.warn('Zero alive proxies after validation — possible network issue or judge server down');
  }
  log.info(`Validated: ${validated.length} total, ${aliveCount} alive`);

  // Step 3: Distributed validation (if Tendril is enabled)
  if (config.tendril.enabled) {
    log.info('Step 3/5: Distributing validation jobs to Tendril swarm...');
    try {
      await runDistributedValidation(validated.filter(p => p.alive));
      log.info('Distributed validation complete');
    } catch (err) {
      log.error('Distributed validation failed — continuing with local results', {
        error: String(err),
      });
    }
  } else {
    log.info('Step 3/5: Tendril disabled — skipping distributed validation');
  }

  // Step 4: Store
  // Main proxy table always gets local validation results.
  // Regional table (populated in step 3) stores per-region data separately.
  log.info('Step 4/5: Storing proxies...');
  upsertProxy(validated);
  log.info(`Stored ${validated.length} proxies`);

  // Step 5: Export
  log.info('Step 5/5: Exporting files...');
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

// ─── Distributed Validation via Tendril ───────────────────────────────────────
// Posts proxy validation jobs to the swarm. Each peer validates from their
// region and stores results in the regional_validation table.

import type { ValidatedProxy } from '../types.js';
import { regionalModel, type RegionalResult } from '../models/regional.js';

async function runDistributedValidation(aliveProxies: ValidatedProxy[]): Promise<void> {
  // Lazy-import TendrilNode to avoid loading Hyperswarm when Tendril is off
  const { TendrilNode } = await import('../tendril/core/node.js');

  const node = new TendrilNode({
    enabled: true,
    swarmTopic: config.tendril.swarmTopic,
    maxConcurrentJob: config.tendril.maxConcurrentJob,
    requestPerSecond: config.tendril.requestPerSecond,
    defaultTimeoutMs: config.tendril.defaultTimeoutMs,
    batchSize: config.tendril.batchSize,
    collectTimeoutMs: config.tendril.collectTimeoutMs,
  });

  try {
    await node.start();

    // Wait for peer discovery
    const waitSec = config.tendril.peerDiscoveryWaitSec;
    log.info(`Waiting ${waitSec}s for peer discovery...`);
    await new Promise(r => setTimeout(r, waitSec * 1000));

    const peerCount = node.getSwarm().getPeerCount();
    if (peerCount === 0) {
      log.warn('No peers found — validating locally only');
      // Still store our own local results as regional data
      storeLocalAsRegional(node.nodeId, aliveProxies);
      return;
    }

    log.info(`Connected to ${peerCount} peer(s) — creating validation jobs`);

    // Batch proxies into validation jobs
    const batchSize = config.tendril.batchSize;
    const batches: ValidatedProxy[][] = [];
    for (let i = 0; i < aliveProxies.length; i += batchSize) {
      batches.push(aliveProxies.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      for (const proxy of batch) {
        const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
        node.createJob({
          targetUrl: 'https://httpbin.org/ip',   // simple connectivity test
          proxyUrl,
          minCompletion: 1,
          maxCompletion: Math.min(peerCount + 1, 5), // one per peer, max 5
          isPublic: true,
        });
      }

      log.info(`Job batch ${i + 1}/${batches.length} dispatched (${batch.length} proxies)`);
    }

    // Also store our own local validation as a regional entry
    storeLocalAsRegional(node.nodeId, aliveProxies);

    // Wait for collection (with timeout)
    const collectTimeout = config.tendril.collectTimeoutMs;
    log.info(`Waiting up to ${collectTimeout / 1000}s for distributed results...`);
    await new Promise(r => setTimeout(r, Math.min(collectTimeout, 60_000)));

    log.info('Distribution phase complete', {
      peer_count: peerCount,
      jobs_dispatched: aliveProxies.length,
    });
  } finally {
    await node.stop();
  }
}

/**
 * Store our own local validation results as regional validation entries.
 * This means even a single-node deployment populates the regional_validation table.
 */
function storeLocalAsRegional(nodeId: string, proxies: ValidatedProxy[]): void {
  // Detect our own region from env or default to 'XX' (unknown)
  const region = process.env.TENDRIL_REGION ?? process.env.NODE_REGION ?? 'XX';
  const now = Math.floor(Date.now() / 1000);

  const results: RegionalResult[] = proxies.map(p => ({
    proxyId: p.proxy_id,
    region,
    nodeId,
    alive: p.alive,
    latencyMs: p.latency_ms,
    googlePass: p.google_pass,
    checkedAt: now,
  }));

  regionalModel.saveBatch(results);
  log.info(`Stored ${results.length} local-region validations`, { region });
}
