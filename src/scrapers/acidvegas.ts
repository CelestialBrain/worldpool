// ─── Acidvegas Meta-Source ─────────────────────────────────────────────────────
// Fetches proxy_sources.txt from acidvegas/proxytools — a curated list of
// 76 proxy API endpoints and raw URLs. We fetch each one and extract proxies.
// Many overlap with our existing scrapers — dedup handles it.

import axios from 'axios';
import type { RawProxy } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:acidvegas');

const META_URL = 'https://raw.githubusercontent.com/acidvegas/proxytools/master/proxy_sources.txt';

function extractProxies(text: string): Array<{ host: string; port: number }> {
  const results: Array<{ host: string; port: number }> = [];
  const lines = text.split('\n');
  for (const line of lines) {
    // Strip protocol prefixes
    const clean = line.trim().replace(/^(https?|socks[45]):\/\//, '');
    const match = clean.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})/);
    if (match) {
      const port = parseInt(match[2], 10);
      if (port >= 1 && port <= 65535) {
        results.push({ host: match[1], port });
      }
    }
  }
  return results;
}

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  // Fetch the meta-source list
  let urls: string[];
  try {
    const res = await axios.get<string>(META_URL, { timeout: 10_000, responseType: 'text' });
    urls = (res.data as string)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.startsWith('http'));
  } catch (err) {
    log.error('Failed to fetch meta-source list', { error: String(err) });
    return [];
  }

  log.info(`Fetching ${urls.length} proxy source URLs`);

  // Fetch each URL in parallel (with limit)
  const fetches = urls.map(async (url) => {
    try {
      const res = await axios.get<string>(url, { timeout: 10_000, responseType: 'text' });
      const proxies = extractProxies(res.data as string);
      for (const p of proxies) {
        // Guess protocol from URL
        let protocol: RawProxy['protocol'] = 'http';
        const lower = url.toLowerCase();
        if (lower.includes('socks5')) protocol = 'socks5';
        else if (lower.includes('socks4')) protocol = 'socks4';
        results.push({ ...p, protocol, source: 'acidvegas' });
      }
    } catch {
      // Silent — many of these URLs are flaky
    }
  });

  await Promise.allSettled(fetches);
  log.info(`Fetched ${results.length} proxies from ${urls.length} meta-sources`);
  return results;
}
