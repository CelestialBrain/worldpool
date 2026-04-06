// ─── Scanner Scraper ──────────────────────────────────────────────────────────
// Discovers open proxies by probing IP ranges on known proxy ports.
// Disabled by default — set SCANNER_ENABLED=true to activate.
// Processes in chunks to avoid memory issues with large target lists.

import { config } from '../../config.js';
import type { RawProxy } from '../../types.js';
import { createLogger } from '../../utils/logger.js';
import { loadTargets } from './targets.js';
import { loadExclusions } from './exclude.js';
import { probeBatch } from './tcp-probe.js';
import { fingerprintProxy } from './fingerprint.js';

const log = createLogger('scraper:scanner');

const CHUNK_SIZE = 10_000; // process 10k probe targets at a time

export async function scrape(): Promise<RawProxy[]> {
  if (!config.scanner.enabled) {
    log.debug('Scanner disabled — returning empty array');
    return [];
  }

  log.info('Scanner enabled — starting IP range scan', {
    ports: config.scanner.ports,
    concurrency: config.scanner.concurrency,
    ratePps: config.scanner.ratePps,
  });

  // Load targets and exclusions
  const allIps = loadTargets(config.scanner.targetsFile);
  const isExcluded = loadExclusions(config.scanner.excludeFile);

  const ips = allIps.filter((ip) => !isExcluded(ip));
  const excluded = allIps.length - ips.length;
  if (excluded > 0) {
    log.info(`Excluded IPs filtered out`, { excluded, remaining: ips.length });
  }

  if (ips.length === 0) {
    log.warn('No scan targets after exclusion filtering — returning empty array');
    return [];
  }

  // Build target list: every IP × every configured port
  const allTargets = ips.flatMap((ip) =>
    config.scanner.ports.map((port) => ({ ip, port })),
  );

  log.info(`Total probe targets: ${allTargets.length} (${ips.length} IPs × ${config.scanner.ports.length} ports)`);

  // Process in chunks to avoid memory issues
  const allOpen: Array<{ ip: string; port: number }> = [];

  for (let i = 0; i < allTargets.length; i += CHUNK_SIZE) {
    const chunk = allTargets.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(allTargets.length / CHUNK_SIZE);

    log.info(`Probing chunk ${chunkNum}/${totalChunks} (${chunk.length} targets)`);

    try {
      const open = await probeBatch(
        chunk,
        config.scanner.concurrency,
        config.scanner.ratePps,
        config.scanner.timeoutMs,
      );
      for (const result of open) {
        allOpen.push(result);
      }
      log.info(`Chunk ${chunkNum}: ${open.length} open ports found (total so far: ${allOpen.length})`);
    } catch (err) {
      log.error(`Chunk ${chunkNum} failed`, { error: String(err) });
    }
  }

  log.info(`TCP probe complete — ${allOpen.length} open ports found`);

  if (allOpen.length === 0) {
    log.info('No open ports found — returning empty array');
    return [];
  }

  // Fingerprint open ports to determine proxy protocol (in batches of 50)
  const results: RawProxy[] = [];
  const FP_BATCH = 50;

  for (let i = 0; i < allOpen.length; i += FP_BATCH) {
    const batch = allOpen.slice(i, i + FP_BATCH);

    const fpResults = await Promise.allSettled(
      batch.map(({ ip, port }) =>
        fingerprintProxy(ip, port, config.scanner.timeoutMs),
      ),
    );

    for (const result of fpResults) {
      if (result.status === 'fulfilled' && result.value.alive) {
        results.push({
          host: result.value.ip,
          port: result.value.port,
          protocol: result.value.protocol,
          source: 'scanner',
        });
      }
    }

    if ((i + FP_BATCH) % 500 === 0 || i + FP_BATCH >= allOpen.length) {
      log.info(`Fingerprinting progress: ${Math.min(i + FP_BATCH, allOpen.length)}/${allOpen.length}, confirmed: ${results.length}`);
    }
  }

  log.info(`Scanner complete`, { open_ports: allOpen.length, confirmed_proxies: results.length });
  return results;
}
