// ─── Scanner Scraper ──────────────────────────────────────────────────────────
// Discovers open proxies by probing IP ranges on known proxy ports.
// Disabled by default — set SCANNER_ENABLED=true to activate.

import { config } from '../../config.js';
import type { RawProxy } from '../../types.js';
import { createLogger } from '../../utils/logger.js';
import { loadTargets } from './targets.js';
import { loadExclusions } from './exclude.js';
import { probeBatch } from './tcp-probe.js';
import { fingerprintProxy } from './fingerprint.js';

const log = createLogger('scraper:scanner');

/**
 * Scrape function compatible with the existing scraper pipeline.
 * Returns an empty array immediately if scanner.enabled is false.
 *
 * When enabled:
 *  1. Loads IP targets from data/scan-targets.txt (expanded from CIDR)
 *  2. Loads exclusions from data/scan-exclude.txt
 *  3. Filters out excluded IPs
 *  4. TCP-probes all target:port combinations with configured concurrency/rate
 *  5. Fingerprints open ports to confirm proxy type
 *  6. Returns confirmed proxies as RawProxy objects
 */
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
  const probeTargets = ips.flatMap((ip) =>
    config.scanner.ports.map((port) => ({ ip, port })),
  );

  log.info(`Starting TCP probe`, { targets: probeTargets.length });

  // TCP probe
  const openPorts = await probeBatch(
    probeTargets,
    config.scanner.concurrency,
    config.scanner.ratePps,
    config.scanner.timeoutMs,
  );

  log.info(`Open ports found`, { count: openPorts.length });

  // Fingerprint open ports to determine proxy protocol
  const results: RawProxy[] = [];

  for (const { ip, port } of openPorts) {
    const fp = await fingerprintProxy(ip, port, config.scanner.timeoutMs);
    if (fp.alive) {
      results.push({
        host: ip,
        port,
        protocol: fp.protocol,
        source: 'scanner',
      });
    }
  }

  log.info(`Scanner complete`, { confirmed_proxies: results.length });
  return results;
}
