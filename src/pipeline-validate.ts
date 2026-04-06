// ─── Validate Shard ───────────────────────────────────────────────────────────
// Phase 2 of the parallel pipeline. Validates a slice of the proxy list.
// Usage: npm run pipeline:validate -- --shard=0 --total-shards=4
// Reads: artifacts/proxies-to-validate.json
// Writes: artifacts/validated-shard-{N}.json

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { validateAll } from './services/validator.js';
import { initStreamExport, streamResult } from './services/stream-export.js';
import type { RawProxy } from './types.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('pipeline:validate');

function parseArgs(): { shard: number; totalShards: number } {
  const args = process.argv.slice(2);
  let shard = 0;
  let totalShards = 4;

  for (const arg of args) {
    if (arg.startsWith('--shard=')) shard = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--total-shards=')) totalShards = parseInt(arg.split('=')[1], 10);
  }

  // Also check env vars (easier for Actions matrix)
  if (process.env.SHARD_INDEX) shard = parseInt(process.env.SHARD_INDEX, 10);
  if (process.env.TOTAL_SHARDS) totalShards = parseInt(process.env.TOTAL_SHARDS, 10);

  return { shard, totalShards };
}

async function main() {
  const { shard, totalShards } = parseArgs();
  log.info(`Validate shard ${shard}/${totalShards} started`);

  // Read the full proxy list
  const allProxies: RawProxy[] = JSON.parse(
    readFileSync('artifacts/proxies-to-validate.json', 'utf-8'),
  );
  log.info(`Loaded ${allProxies.length} total proxies`);

  // Take our slice
  const chunkSize = Math.ceil(allProxies.length / totalShards);
  const start = shard * chunkSize;
  const end = Math.min(start + chunkSize, allProxies.length);
  const myProxies = allProxies.slice(start, end);
  log.info(`Shard ${shard}: validating proxies ${start}-${end} (${myProxies.length} proxies)`);

  // Validate with streaming export
  initStreamExport();
  const validated = await validateAll(myProxies, streamResult);

  const alive = validated.filter(p => p.alive).length;
  const hijacked = validated.filter(p => p.hijacked).length;
  log.info(`Shard ${shard} complete: ${validated.length} validated, ${alive} alive, ${hijacked} hijacked`);

  // Write results
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(`artifacts/validated-shard-${shard}.json`, JSON.stringify(validated));
  log.info(`Wrote results to artifacts/validated-shard-${shard}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('Validate shard failed', { error: String(err) });
    process.exit(1);
  });
