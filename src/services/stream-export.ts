// ─── Streaming Exporter ───────────────────────────────────────────────────────
// Appends validated proxies to text files in real-time as they pass validation.
// Called via onResult callback during validateAll().

import { appendFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ValidatedProxy, SitePassKey } from '../types.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('stream-export');

const proxiesDir = config.export.proxiesDir;
const bySpeedDir = join(proxiesDir, 'by-speed');
const byAnonymityDir = join(proxiesDir, 'by-anonymity');
const bySiteDir = join(proxiesDir, 'by-site');

const ALL_FILES = [
  join(proxiesDir, 'all.txt'),
  join(proxiesDir, 'http.txt'),
  join(proxiesDir, 'socks4.txt'),
  join(proxiesDir, 'socks5.txt'),
  join(proxiesDir, 'elite.txt'),
  join(proxiesDir, 'google-pass.txt'),
  join(proxiesDir, 'hijacked.txt'),
  join(bySpeedDir, 'turbo.txt'),
  join(bySpeedDir, 'fast.txt'),
  join(bySpeedDir, 'medium.txt'),
  join(bySpeedDir, 'slow.txt'),
  join(byAnonymityDir, 'elite.txt'),
  join(byAnonymityDir, 'anonymous.txt'),
  join(bySiteDir, 'google.txt'),
  join(bySiteDir, 'discord.txt'),
  join(bySiteDir, 'tiktok.txt'),
  join(bySiteDir, 'instagram.txt'),
  join(bySiteDir, 'x.txt'),
  join(bySiteDir, 'reddit.txt'),
  join(bySiteDir, 'watsons.txt'),
];

/** Clear all export text files — call once before validation starts. */
export function initStreamExport(): void {
  for (const dir of [proxiesDir, bySpeedDir, byAnonymityDir, bySiteDir]) {
    mkdirSync(dir, { recursive: true });
  }
  for (const file of ALL_FILES) {
    writeFileSync(file, '', 'utf-8');
  }
  log.info('Stream export initialized — all text files cleared');
}

/** Append a single validated proxy to the appropriate text files. */
export function streamResult(proxy: ValidatedProxy): void {
  const line = `${proxy.host}:${proxy.port}\n`;

  if (proxy.alive && !proxy.hijacked) {
    appendFileSync(join(proxiesDir, 'all.txt'), line);
    appendFileSync(join(proxiesDir, `${proxy.protocol}.txt`), line);

    // Anonymity
    if (proxy.anonymity === 'elite') {
      appendFileSync(join(proxiesDir, 'elite.txt'), line);
      appendFileSync(join(byAnonymityDir, 'elite.txt'), line);
    } else if (proxy.anonymity === 'anonymous') {
      appendFileSync(join(byAnonymityDir, 'anonymous.txt'), line);
    }

    // Google pass
    if (proxy.google_pass) {
      appendFileSync(join(proxiesDir, 'google-pass.txt'), line);
    }

    // Speed tier
    if (proxy.latency_ms >= 0) {
      if (proxy.latency_ms < 200) {
        appendFileSync(join(bySpeedDir, 'turbo.txt'), line);
      } else if (proxy.latency_ms <= 500) {
        appendFileSync(join(bySpeedDir, 'fast.txt'), line);
      } else if (proxy.latency_ms <= 2000) {
        appendFileSync(join(bySpeedDir, 'medium.txt'), line);
      } else {
        appendFileSync(join(bySpeedDir, 'slow.txt'), line);
      }
    }

    // Site pass
    if (proxy.site_pass) {
      const sites: SitePassKey[] = ['google', 'discord', 'tiktok', 'instagram', 'x', 'reddit', 'watsons'];
      for (const site of sites) {
        if (proxy.site_pass[site]) {
          appendFileSync(join(bySiteDir, `${site}.txt`), line);
        }
      }
    }
  }

  if (proxy.hijacked) {
    appendFileSync(join(proxiesDir, 'hijacked.txt'), line);
  }
}
