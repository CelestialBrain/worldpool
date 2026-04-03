// ─── Exclusion List ───────────────────────────────────────────────────────────
// Loads data/scan-exclude.txt and provides a fast IP-in-range check.

import { readFileSync, existsSync } from 'fs';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('scanner:exclude');

/** A parsed CIDR entry: network base and mask as 32-bit integers. */
interface CidrEntry {
  base: number;
  mask: number;
}

/**
 * Parse a dotted-decimal IPv4 address into a 32-bit unsigned integer.
 */
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Parse a CIDR string or plain IP into a CidrEntry.
 * Returns null if the input is invalid.
 */
function parseCidr(cidr: string): CidrEntry | null {
  const slash = cidr.indexOf('/');
  const base = slash === -1 ? cidr : cidr.slice(0, slash);
  const prefix = slash === -1 ? 32 : parseInt(cidr.slice(slash + 1), 10);

  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

  const baseInt = ipToInt(base);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  if (isNaN(baseInt)) return null;

  return { base: baseInt & mask, mask };
}

/**
 * Load the exclude file and return a function that checks whether a given IP
 * is excluded. The returned checker is O(n) in the number of exclusion entries.
 *
 * @param filePath - Path to the exclusion file (one CIDR or IP per line)
 */
export function loadExclusions(filePath: string): (ip: string) => boolean {
  if (!existsSync(filePath)) {
    log.debug(`Exclude file not found — no exclusions`, { filePath });
    return () => false;
  }

  const lines = readFileSync(filePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const entries: CidrEntry[] = [];
  for (const line of lines) {
    const entry = parseCidr(line);
    if (entry) {
      entries.push(entry);
    } else {
      log.warn(`Invalid exclusion entry — skipping`, { line });
    }
  }

  log.info(`Loaded exclusions`, { filePath, count: entries.length });

  return (ip: string): boolean => {
    const addr = ipToInt(ip);
    for (const { base, mask } of entries) {
      if ((addr & mask) === base) return true;
    }
    return false;
  };
}
