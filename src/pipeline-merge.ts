// ─── Merge Phase ──────────────────────────────────────────────────────────────
// Phase 3 of the parallel pipeline. Merges shard results, stores to DB, exports.
// Usage: npm run pipeline:merge -- --total-shards=4
// Reads: artifacts/validated-shard-{0..N}.json
// Writes: proxies/*, data/*, README.md, CHANGELOG.md

import { readFileSync, existsSync } from 'fs';
import { upsertProxy } from './models/proxy.js';
import { exportFiles, updateReadmeStats } from './services/exporter.js';
import type { ValidatedProxy } from './types.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('pipeline:merge');

async function main() {
  let totalShards = 4;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--total-shards=')) totalShards = parseInt(arg.split('=')[1], 10);
  }
  if (process.env.TOTAL_SHARDS) totalShards = parseInt(process.env.TOTAL_SHARDS, 10);

  log.info(`Merge phase started — collecting ${totalShards} shards`);

  // Collect all shard results
  const allValidated: ValidatedProxy[] = [];
  for (let i = 0; i < totalShards; i++) {
    const path = `artifacts/validated-shard-${i}.json`;
    if (!existsSync(path)) {
      log.warn(`Shard ${i} result not found at ${path} — skipping`);
      continue;
    }
    const shardResults: ValidatedProxy[] = JSON.parse(readFileSync(path, 'utf-8'));
    log.info(`Shard ${i}: ${shardResults.length} results (${shardResults.filter(p => p.alive).length} alive)`);
    for (const proxy of shardResults) {
      allValidated.push(proxy);
    }
  }

  if (allValidated.length === 0) {
    log.error('No shard results found — aborting merge');
    process.exit(1);
  }

  const aliveCount = allValidated.filter(p => p.alive).length;
  const hijackedCount = allValidated.filter(p => p.hijacked).length;
  log.info(`Merged: ${allValidated.length} total, ${aliveCount} alive, ${hijackedCount} hijacked`);

  // Store to DB
  log.info('Storing to database...');
  upsertProxy(allValidated);
  log.info(`Stored ${allValidated.length} proxies`);

  // Export
  log.info('Exporting files...');
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

  log.info(`Merge complete: ${aliveCount} alive, ${hijackedCount} hijacked`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('Merge phase failed', { error: String(err) });
    process.exit(1);
  });
