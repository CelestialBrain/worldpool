// ─── Opt-out Service ─────────────────────────────────────────────────────────
// POST /optout — append an IP or CIDR to data/scan-exclude.txt so it is never
// scanned again. Also useful as a pre-probe check in the validation pipeline.

import { Hono } from 'hono';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('service:optout');

/** Validates a single dotted-decimal IPv4 address. */
function isValidIp(ip: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  return ip.split('.').every((octet) => {
    // Reject leading zeros (e.g. '01', '001') to avoid octal misinterpretation
    if (octet.length > 1 && octet.startsWith('0')) return false;
    return parseInt(octet, 10) <= 255;
  });
}

/** Validates a CIDR notation string (e.g. "10.0.0.0/8"). */
function isValidCidr(cidr: string): boolean {
  const [ip, prefix] = cidr.split('/');
  if (!ip || prefix === undefined) return false;
  const num = parseInt(prefix, 10);
  return isValidIp(ip) && !isNaN(num) && num >= 0 && num <= 32;
}

/**
 * Append a CIDR or IP to the scan exclusion file.
 * Creates the file (and parent directories) if it does not exist.
 */
function appendExclusion(entry: string): void {
  const filePath = config.scanner.excludeFile;
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  appendFileSync(filePath, `${entry}\n`, 'utf8');
  log.info(`Opt-out recorded`, { entry, file: filePath });
}

const optout = new Hono();

/**
 * POST /optout
 *
 * Body (JSON):
 *   { "ip": "1.2.3.4" }          — exclude a single IP
 *   { "cidr": "1.2.3.0/24" }     — exclude a CIDR range
 *
 * Returns { ok: true } on success, or a 400 error with a message.
 */
optout.post('/optout', async (c) => {
  let body: Record<string, unknown>;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { ip, cidr } = body as { ip?: string; cidr?: string };

  if (cidr !== undefined) {
    if (typeof cidr !== 'string' || !isValidCidr(cidr)) {
      return c.json({ ok: false, error: 'Invalid CIDR — expected format: x.x.x.x/xx' }, 400);
    }
    appendExclusion(cidr);
    return c.json({ ok: true, added: cidr });
  }

  if (ip !== undefined) {
    if (typeof ip !== 'string' || !isValidIp(ip)) {
      return c.json({ ok: false, error: 'Invalid IP address' }, 400);
    }
    appendExclusion(ip);
    return c.json({ ok: true, added: ip });
  }

  return c.json({ ok: false, error: 'Provide either "ip" or "cidr" in the request body' }, 400);
});

export default optout;
