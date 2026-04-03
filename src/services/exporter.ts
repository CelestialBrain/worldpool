// ─── Exporter Service ─────────────────────────────────────────────────────────
// Writes validated proxies to flat files (proxies/) and JSON exports (data/).
// Also updates README.md stats section.

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { queryProxy, getStats } from '../models/proxy.js';
import type { ProxyResponse } from '../types.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('exporter');

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function toLines(proxies: ProxyResponse[]): string {
  return proxies.map((p) => `${p.host}:${p.port}`).join('\n') + '\n';
}

export async function exportFiles(): Promise<void> {
  const [proxiesDir, dataDir] = [config.export.proxiesDir, config.export.dataDir];

  await Promise.all([ensureDir(proxiesDir), ensureDir(dataDir)]);

  // Query alive proxies by protocol
  const http = queryProxy({ protocol: 'http', alive_only: true, limit: 100_000 });
  const socks4 = queryProxy({ protocol: 'socks4', alive_only: true, limit: 100_000 });
  const socks5 = queryProxy({ protocol: 'socks5', alive_only: true, limit: 100_000 });
  const elite = queryProxy({ anonymity: 'elite', alive_only: true, limit: 100_000 });
  const googlePass = queryProxy({ google_pass: true, alive_only: true, limit: 100_000 });
  const all = queryProxy({ alive_only: true, limit: 100_000 });

  const stats = getStats();

  await Promise.all([
    writeFile(join(proxiesDir, 'http.txt'), toLines(http)),
    writeFile(join(proxiesDir, 'socks4.txt'), toLines(socks4)),
    writeFile(join(proxiesDir, 'socks5.txt'), toLines(socks5)),
    writeFile(join(proxiesDir, 'elite.txt'), toLines(elite)),
    writeFile(join(proxiesDir, 'google-pass.txt'), toLines(googlePass)),
    writeFile(join(dataDir, 'proxies.json'), JSON.stringify(all, null, 2)),
    writeFile(join(dataDir, 'stats.json'), JSON.stringify(stats, null, 2)),
  ]);

  log.info('Export complete', {
    http: http.length,
    socks4: socks4.length,
    socks5: socks5.length,
    elite: elite.length,
    google_pass: googlePass.length,
  });
}

export async function updateReadmeStats(): Promise<void> {
  const readmePath = 'README.md';

  let content: string;
  try {
    content = await readFile(readmePath, 'utf-8');
  } catch {
    log.warn('README.md not found — skipping stats update');
    return;
  }

  const stats = getStats();
  const updated = new Date(
    stats.last_updated ? stats.last_updated * 1000 : Date.now(),
  ).toISOString();

  const table = `| Metric | Value |
| --- | --- |
| Total proxies | ${stats.proxy_count} |
| Alive proxies | ${stats.alive_count} |
| Elite proxies | ${stats.elite_count} |
| Google pass | ${stats.google_pass_count} |
| Avg latency | ${stats.avg_latency_ms} ms |
| Last updated | ${updated} |
`;

  const start = '<!-- STATS_START -->';
  const end = '<!-- STATS_END -->';

  const before = content.indexOf(start);
  const after = content.indexOf(end);

  if (before === -1 || after === -1) {
    log.warn('README.md missing STATS_START/STATS_END markers — skipping update');
    return;
  }

  const newContent =
    content.slice(0, before + start.length) + '\n' + table + content.slice(after);

  await writeFile(readmePath, newContent, 'utf-8');
  log.info('README.md stats updated');
}
