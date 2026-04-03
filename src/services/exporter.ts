// ─── Exporter Service ─────────────────────────────────────────────────────────
// Writes validated proxies to flat files (proxies/) and JSON exports (data/).
// Also updates README.md stats section and appends CHANGELOG.md.

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import {
  queryProxy,
  getStats,
  queryHijacked,
  queryProxyByLatencyRange,
  getSourceQuality,
} from '../models/proxy.js';
import type { ProxyResponse, HijackedProxyResponse, PoolStatsResponse } from '../types.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('exporter');

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function toLines(proxies: ProxyResponse[]): string {
  return proxies.map((p) => `${p.host}:${p.port}`).join('\n') + '\n';
}

function hijackedToLines(proxies: HijackedProxyResponse[]): string {
  return proxies.map((p) => `${p.ip}:${p.port}`).join('\n') + '\n';
}

function buildMaliciousAsnList(proxies: HijackedProxyResponse[]): string {
  const counts = new Map<string, number>();
  for (const p of proxies) {
    if (p.asn) {
      counts.set(p.asn, (counts.get(p.asn) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return '';

  return (
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([asn, count]) => `${asn} ${count}`)
      .join('\n') + '\n'
  );
}

/** Read old stats.json before the export overwrites it. Returns null if unavailable. */
async function readOldStats(dataDir: string): Promise<PoolStatsResponse | null> {
  try {
    const raw = await readFile(join(dataDir, 'stats.json'), 'utf-8');
    return JSON.parse(raw) as PoolStatsResponse;
  } catch {
    return null;
  }
}

/**
 * Append a new entry to CHANGELOG.md after every export.
 * Diffs are computed against oldStats if available.
 */
async function appendChangelog(
  oldStats: PoolStatsResponse | null,
  newStats: PoolStatsResponse,
): Promise<void> {
  const changelogPath = 'CHANGELOG.md';

  let content: string;
  try {
    content = await readFile(changelogPath, 'utf-8');
  } catch {
    content = '# Changelog\n\n';
  }

  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const dateStr =
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ` +
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;

  function delta(newVal: number, oldVal: number | undefined): string {
    if (oldVal === undefined) return '';
    const diff = newVal - oldVal;
    return diff >= 0 ? ` (+${diff})` : ` (${diff})`;
  }

  const byProtocol = newStats.by_protocol ?? [];
  const httpCount = byProtocol.find((p) => p.protocol === 'http')?.proxy_count ?? 0;
  const socks4Count = byProtocol.find((p) => p.protocol === 'socks4')?.proxy_count ?? 0;
  const socks5Count = byProtocol.find((p) => p.protocol === 'socks5')?.proxy_count ?? 0;

  const aliveStr = `${newStats.alive_count.toLocaleString()}${delta(newStats.alive_count, oldStats?.alive_count)}`;
  const hijackedStr = `${newStats.hijacked_count.toLocaleString()}`;
  const googleStr = `${newStats.google_pass_count.toLocaleString()}${delta(newStats.google_pass_count, oldStats?.google_pass_count)}`;
  const latencyStr = `${newStats.avg_latency_ms.toLocaleString()} ms`;
  const reliabilityStr = `${newStats.avg_reliability_pct.toFixed(1)}%`;

  const entry = `## ${dateStr}
- Total alive: ${aliveStr}
- Hijacked blocked: ${hijackedStr}
- Google pass: ${googleStr}
- Avg latency: ${latencyStr}
- Avg reliability: ${reliabilityStr}
- By protocol: HTTP ${httpCount}, SOCKS4 ${socks4Count}, SOCKS5 ${socks5Count}

`;

  // Prepend after the "# Changelog" header line
  const headerEnd = content.indexOf('\n');
  const newContent =
    headerEnd === -1
      ? `# Changelog\n\n${entry}`
      : content.slice(0, headerEnd + 1) + '\n' + entry + content.slice(headerEnd + 1);

  await writeFile(changelogPath, newContent, 'utf-8');
  log.info('CHANGELOG.md updated');
}

export async function exportFiles(): Promise<void> {
  const [proxiesDir, dataDir] = [config.export.proxiesDir, config.export.dataDir];

  // Read old stats before overwriting
  const oldStats = await readOldStats(dataDir);

  const byAnonymityDir = join(proxiesDir, 'by-anonymity');
  const bySpeedDir = join(proxiesDir, 'by-speed');

  await Promise.all([
    ensureDir(proxiesDir),
    ensureDir(dataDir),
    ensureDir(byAnonymityDir),
    ensureDir(bySpeedDir),
  ]);

  // Query alive proxies by protocol
  const http = queryProxy({ protocol: 'http', alive_only: true, limit: 100_000 });
  const socks4 = queryProxy({ protocol: 'socks4', alive_only: true, limit: 100_000 });
  const socks5 = queryProxy({ protocol: 'socks5', alive_only: true, limit: 100_000 });
  const elite = queryProxy({ anonymity: 'elite', alive_only: true, limit: 100_000 });
  const googlePass = queryProxy({ google_pass: true, alive_only: true, limit: 100_000 });
  const all = queryProxy({ alive_only: true, limit: 100_000 });

  // by-anonymity
  const anonymous = queryProxy({ anonymity: 'anonymous', alive_only: true, limit: 100_000 });

  // by-speed tiers
  const turbo = queryProxyByLatencyRange(0, 199);
  const fast = queryProxyByLatencyRange(200, 500);
  const medium = queryProxyByLatencyRange(501, 2000);
  const slow = queryProxyByLatencyRange(2001, 999_999);

  // Query hijacked proxies for threat-intel output
  const hijacked = queryHijacked();

  const stats = getStats();
  const sourceQuality = getSourceQuality();
  const fullStats = { ...stats, source_quality: sourceQuality };

  await Promise.all([
    // Existing flat files (backwards-compatible)
    writeFile(join(proxiesDir, 'all.txt'), toLines(all)),
    writeFile(join(proxiesDir, 'http.txt'), toLines(http)),
    writeFile(join(proxiesDir, 'socks4.txt'), toLines(socks4)),
    writeFile(join(proxiesDir, 'socks5.txt'), toLines(socks5)),
    writeFile(join(proxiesDir, 'elite.txt'), toLines(elite)),
    writeFile(join(proxiesDir, 'google-pass.txt'), toLines(googlePass)),
    writeFile(join(proxiesDir, 'hijacked.txt'), hijackedToLines(hijacked)),
    writeFile(join(proxiesDir, 'hijacked.json'), JSON.stringify(hijacked, null, 2)),
    writeFile(join(proxiesDir, 'malicious-asn.txt'), buildMaliciousAsnList(hijacked)),
    // by-anonymity subdirectory
    writeFile(join(byAnonymityDir, 'elite.txt'), toLines(elite)),
    writeFile(join(byAnonymityDir, 'anonymous.txt'), toLines(anonymous)),
    // by-speed subdirectory
    writeFile(join(bySpeedDir, 'turbo.txt'), toLines(turbo)),
    writeFile(join(bySpeedDir, 'fast.txt'), toLines(fast)),
    writeFile(join(bySpeedDir, 'medium.txt'), toLines(medium)),
    writeFile(join(bySpeedDir, 'slow.txt'), toLines(slow)),
    // Data exports
    writeFile(join(dataDir, 'proxies.json'), JSON.stringify(all, null, 2)),
    writeFile(join(dataDir, 'stats.json'), JSON.stringify(fullStats, null, 2)),
  ]);

  log.info('Export complete', {
    all: all.length,
    http: http.length,
    socks4: socks4.length,
    socks5: socks5.length,
    elite: elite.length,
    google_pass: googlePass.length,
    hijacked: hijacked.length,
    anonymous: anonymous.length,
    turbo: turbo.length,
    fast: fast.length,
    medium: medium.length,
    slow: slow.length,
  });

  await appendChangelog(oldStats, fullStats);
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
| Hijacked | ${stats.hijacked_count} |
| Avg latency | ${stats.avg_latency_ms} ms |
| Last updated | ${updated} |
`;

  // ── STATS markers ──────────────────────────────────────────────────────────
  const statsStart = '<!-- STATS_START -->';
  const statsEnd = '<!-- STATS_END -->';

  const sBefore = content.indexOf(statsStart);
  const sAfter = content.indexOf(statsEnd);

  if (sBefore === -1 || sAfter === -1) {
    log.warn('README.md missing STATS_START/STATS_END markers — skipping update');
    return;
  }

  content =
    content.slice(0, sBefore + statsStart.length) + '\n' + table + content.slice(sAfter);

  // ── BADGES markers ─────────────────────────────────────────────────────────
  const badgesStart = '<!-- BADGES_START -->';
  const badgesEnd = '<!-- BADGES_END -->';

  const bBefore = content.indexOf(badgesStart);
  const bAfter = content.indexOf(badgesEnd);

  if (bBefore !== -1 && bAfter !== -1) {
    const dateLabel = updated.slice(0, 10).replace(/-/g, '--');
    const reliabilityLabel = `${stats.avg_reliability_pct.toFixed(1)}%25`;

    const badges = `![Alive](https://img.shields.io/badge/alive-${stats.alive_count}-brightgreen)
![Google Pass](https://img.shields.io/badge/google--pass-${stats.google_pass_count}-blue)
![Hijacked Blocked](https://img.shields.io/badge/hijacked--blocked-${stats.hijacked_count}-red)
![Avg Latency](https://img.shields.io/badge/avg--latency-${stats.avg_latency_ms}ms-yellow)
![Reliability](https://img.shields.io/badge/reliability-${reliabilityLabel}-purple)
![Updated](https://img.shields.io/badge/updated-${dateLabel}-lightgrey)
`;

    content =
      content.slice(0, bBefore + badgesStart.length) + '\n' + badges + content.slice(bAfter);
  }

  await writeFile(readmePath, content, 'utf-8');
  log.info('README.md stats updated');
}
