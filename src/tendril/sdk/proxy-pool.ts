// ─── Proxy Pool ───────────────────────────────────────────────────────────────
// Fetches validated proxy lists from Worldpool's GitHub-hosted files.

import axios from 'axios';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:proxy-pool');

const RAW_BASE = 'https://raw.githubusercontent.com/CelestialBrain/worldpool/main/proxies';

export interface ProxyFilter {
  protocol?: 'http' | 'socks4' | 'socks5';
  googlePass?: boolean;
  maxLatencyMs?: number;
}

export class ProxyPool {
  private pool: Map<string, string[]> = new Map(); // protocol → [host:port]
  private lastRefresh: number = 0;
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  /** Refresh proxy lists from Worldpool GitHub. */
  async refresh(): Promise<void> {
    try {
      const [http, socks4, socks5] = await Promise.allSettled([
        this.fetchList(`${RAW_BASE}/http.txt`),
        this.fetchList(`${RAW_BASE}/socks4.txt`),
        this.fetchList(`${RAW_BASE}/socks5.txt`),
      ]);

      if (http.status === 'fulfilled') this.pool.set('http', http.value);
      if (socks4.status === 'fulfilled') this.pool.set('socks4', socks4.value);
      if (socks5.status === 'fulfilled') this.pool.set('socks5', socks5.value);

      const total = Array.from(this.pool.values()).reduce((a, b) => a + b.length, 0);
      this.lastRefresh = Date.now();

      log.info('Proxy pool refreshed', { total, http: this.pool.get('http')?.length ?? 0 });
    } catch (err) {
      log.error('Failed to refresh proxy pool', { error: String(err) });
    }
  }

  /** Fetch a proxy list file. */
  private async fetchList(url: string): Promise<string[]> {
    const res = await axios.get<string>(url, { timeout: 10_000, responseType: 'text' });
    return (res.data as string)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'));
  }

  /** Auto-refresh if stale. */
  private async ensureFresh(): Promise<void> {
    if (Date.now() - this.lastRefresh > this.ttlMs) {
      await this.refresh();
    }
  }

  /** Get a random proxy matching filter. Returns full URL. */
  async getRandom(filter?: ProxyFilter): Promise<string | null> {
    await this.ensureFresh();
    const proxies = this.getFiltered(filter);
    if (proxies.length === 0) return null;

    const idx = Math.floor(Math.random() * proxies.length);
    return proxies[idx];
  }

  /** Get all proxies matching filter. Returns full URLs. */
  async getAll(filter?: ProxyFilter): Promise<string[]> {
    await this.ensureFresh();
    return this.getFiltered(filter);
  }

  /** Apply filter and return proxy URLs. */
  private getFiltered(filter?: ProxyFilter): string[] {
    const result: string[] = [];

    const protocols = filter?.protocol
      ? [filter.protocol]
      : ['http', 'socks4', 'socks5'];

    for (const proto of protocols) {
      const list = this.pool.get(proto) ?? [];
      for (const entry of list) {
        result.push(`${proto}://${entry}`);
      }
    }

    return result;
  }

  /** Get pool stats. */
  getStats(): { protocol: string; count: number }[] {
    return Array.from(this.pool.entries()).map(([protocol, list]) => ({
      protocol,
      count: list.length,
    }));
  }
}
