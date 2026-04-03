// ─── Scan Targets ─────────────────────────────────────────────────────────────
// Loads and expands CIDR ranges from the targets file into individual IPs.

import { readFileSync, existsSync } from 'fs';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('scanner:targets');

/**
 * Parse a dotted-decimal IPv4 address into a 32-bit integer.
 */
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Convert a 32-bit integer back to a dotted-decimal IPv4 string.
 */
function intToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.');
}

/**
 * Expand a CIDR range (e.g. "10.0.0.0/24") into an array of IP strings.
 * Skips network address and broadcast address for host ranges (/31 and smaller).
 */
export function expandCidr(cidr: string): string[] {
  const [base, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  if (!base || isNaN(prefix) || prefix < 0 || prefix > 32) {
    log.warn(`Invalid CIDR — skipping`, { cidr });
    return [];
  }

  const baseInt = ipToInt(base) & (~0 << (32 - prefix)) >>> 0;
  const count = 1 << (32 - prefix); // 2^(32-prefix)

  // For host ranges (/31 uses both addresses per RFC 3021, so only skip for /30 and smaller)
  const start = prefix <= 30 ? baseInt + 1 : baseInt;
  const end = prefix <= 30 ? baseInt + count - 2 : baseInt + count - 1;

  const ips: string[] = [];
  for (let i = start; i <= end; i++) {
    ips.push(intToIp(i));
  }
  return ips;
}

/**
 * Load the targets file and return all individual IPs expanded from CIDR ranges.
 * Skips comment lines (starting with #) and blank lines.
 *
 * @param filePath - Path to the targets file (one CIDR per line)
 */
export function loadTargets(filePath: string): string[] {
  if (!existsSync(filePath)) {
    log.warn(`Targets file not found — no IPs to scan`, { filePath });
    return [];
  }

  const lines = readFileSync(filePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const ips: string[] = [];
  for (const line of lines) {
    if (line.includes('/')) {
      ips.push(...expandCidr(line));
    } else {
      // Single IP without CIDR notation
      ips.push(line);
    }
  }

  log.info(`Loaded scan targets`, { filePath, cidrs: lines.length, ips: ips.length });
  return ips;
}
