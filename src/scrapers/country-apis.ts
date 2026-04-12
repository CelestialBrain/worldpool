// ─── Country-Specific API Scraper ─────────────────────────────────────────────
// Fetches proxies from APIs that support country filtering.
// Focuses on underrepresented countries like PH, ID, TH, VN, etc.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:country-apis');

// Countries to specifically fetch (underrepresented in global lists)
const TARGET_COUNTRIES = ['PH', 'ID', 'TH', 'VN', 'MY', 'BD', 'PK', 'KH', 'MM'];

interface ApiSource {
  name: string;
  buildUrl: (country: string) => string;
  parseResponse: (data: string, country: string) => RawProxy[];
}

function parseHostPort(text: string, country: string, source: string): RawProxy[] {
  const results: RawProxy[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const clean = line.trim().replace(/^(https?|socks[45]):\/\//, '');
    const match = clean.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})/);
    if (match) {
      const port = parseInt(match[2], 10);
      if (port >= 1 && port <= 65535) {
        results.push({ host: match[1], port, protocol: 'http', country, source });
      }
    }
  }
  return results;
}

const APIS: ApiSource[] = [
  {
    name: 'proxyscrape-country',
    buildUrl: (cc) => `https://api.proxyscrape.com/v2/?request=displayproxies&protocol=all&timeout=10000&country=${cc.toLowerCase()}`,
    parseResponse: (data, cc) => parseHostPort(data, cc, 'proxyscrape-country'),
  },
  {
    name: 'databay-country',
    buildUrl: (cc) => `https://databay.com/api/v1/proxy-list?country=${cc}&format=txt`,
    parseResponse: (data, cc) => parseHostPort(data, cc, 'databay-country'),
  },
  {
    name: 'geonode-country',
    buildUrl: (cc) => `https://proxylist.geonode.com/api/proxy-list?country=${cc}&limit=500&sort_by=lastChecked&sort_type=desc`,
    parseResponse: (data, cc) => {
      const results: RawProxy[] = [];
      try {
        const json = JSON.parse(data);
        for (const item of json.data ?? []) {
          const port = parseInt(item.port, 10);
          if (!item.ip || !port || isNaN(port)) continue;
          const protocols = item.protocols ?? ['http'];
          for (const proto of protocols) {
            let protocol: ProxyProtocol = 'http';
            if (proto === 'socks5') protocol = 'socks5';
            else if (proto === 'socks4') protocol = 'socks4';
            results.push({ host: item.ip, port, protocol, country: cc, source: 'geonode-country' });
          }
        }
      } catch { /* ignore parse errors */ }
      return results;
    },
  },
];

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];

  const fetches = TARGET_COUNTRIES.flatMap(cc =>
    APIS.map(async (api) => {
      try {
        const res = await axios.get<string>(api.buildUrl(cc), {
          timeout: 15_000,
          responseType: 'text',
        });
        const proxies = api.parseResponse(res.data as string, cc);
        if (proxies.length > 0) {
          for (const p of proxies) results.push(p);
        }
      } catch {
        // Silent — individual API/country combos fail often
      }
    }),
  );

  await Promise.allSettled(fetches);
  log.info(`Fetched ${results.length} proxies from ${APIS.length} APIs × ${TARGET_COUNTRIES.length} countries`);
  return results;
}
