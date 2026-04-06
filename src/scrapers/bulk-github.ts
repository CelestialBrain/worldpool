// ─── Bulk GitHub Sources ──────────────────────────────────────────────────────
// Additional proxy list repos discovered from GitHub tags.
// All follow host:port format (some need protocol prefix stripped).
// Combined into a single scraper to avoid 14 separate files.

import axios from 'axios';
import type { RawProxy, ProxyProtocol } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scraper:bulk-github');

interface Source {
  name: string;
  url: string;
  protocol: ProxyProtocol;
  stripPrefix?: boolean; // strip "http://", "socks5://", etc.
}

const SOURCES: Source[] = [
  // ebrasha/abdal-proxy-hub (~10k per file, every 10 min)
  { name: 'ebrasha', url: 'https://raw.githubusercontent.com/ebrasha/abdal-proxy-hub/main/http-proxy-list-by-EbraSha.txt', protocol: 'http' },
  { name: 'ebrasha', url: 'https://raw.githubusercontent.com/ebrasha/abdal-proxy-hub/main/socks4-proxy-list-by-EbraSha.txt', protocol: 'socks4' },
  { name: 'ebrasha', url: 'https://raw.githubusercontent.com/ebrasha/abdal-proxy-hub/main/socks5-proxy-list-by-EbraSha.txt', protocol: 'socks5' },

  // Munachukwuw/Best-Free-Proxys (~13k total)
  { name: 'munachukwuw', url: 'https://raw.githubusercontent.com/Munachukwuw/Best-Free-Proxys/main/http.txt', protocol: 'http' },
  { name: 'munachukwuw', url: 'https://raw.githubusercontent.com/Munachukwuw/Best-Free-Proxys/main/socks4.txt', protocol: 'socks4' },
  { name: 'munachukwuw', url: 'https://raw.githubusercontent.com/Munachukwuw/Best-Free-Proxys/main/socks5.txt', protocol: 'socks5' },

  // gitrecon1455/fresh-proxy-list (~10k, every 10 min)
  { name: 'gitrecon1455', url: 'https://raw.githubusercontent.com/gitrecon1455/fresh-proxy-list/main/proxylist.txt', protocol: 'http' },

  // proxygenerator1/ProxyGenerator (~8k)
  { name: 'proxygenerator', url: 'https://raw.githubusercontent.com/proxygenerator1/ProxyGenerator/main/ALL/ALL.txt', protocol: 'http' },

  // dpangestuw/Free-Proxy (~7k, every 5 min, needs prefix strip)
  { name: 'dpangestuw', url: 'https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/http_proxies.txt', protocol: 'http', stripPrefix: true },
  { name: 'dpangestuw', url: 'https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/socks4_proxies.txt', protocol: 'socks4', stripPrefix: true },
  { name: 'dpangestuw', url: 'https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/socks5_proxies.txt', protocol: 'socks5', stripPrefix: true },

  // officialputuid/ProxyForEveryone (~4k socks5)
  { name: 'officialputuid', url: 'https://raw.githubusercontent.com/officialputuid/ProxyForEveryone/main/http/http.txt', protocol: 'http' },
  { name: 'officialputuid', url: 'https://raw.githubusercontent.com/officialputuid/ProxyForEveryone/main/socks4/socks4.txt', protocol: 'socks4' },
  { name: 'officialputuid', url: 'https://raw.githubusercontent.com/officialputuid/ProxyForEveryone/main/socks5/socks5.txt', protocol: 'socks5' },

  // TuanMinPay/live-proxy (~3k)
  { name: 'tuanminpay', url: 'https://raw.githubusercontent.com/TuanMinPay/live-proxy/master/http.txt', protocol: 'http' },
  { name: 'tuanminpay', url: 'https://raw.githubusercontent.com/TuanMinPay/live-proxy/master/socks4.txt', protocol: 'socks4' },
  { name: 'tuanminpay', url: 'https://raw.githubusercontent.com/TuanMinPay/live-proxy/master/socks5.txt', protocol: 'socks5' },

  // komutan234/Proxy-List-Free (~3k, every 2 min)
  { name: 'komutan234', url: 'https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/http.txt', protocol: 'http' },
  { name: 'komutan234', url: 'https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks4.txt', protocol: 'socks4' },
  { name: 'komutan234', url: 'https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt', protocol: 'socks5' },

  // Anonym0usWork1221/Free-Proxies (~3.6k, every 2h)
  { name: 'anonym0us', url: 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/http_proxies.txt', protocol: 'http' },
  { name: 'anonym0us', url: 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks4_proxies.txt', protocol: 'socks4' },
  { name: 'anonym0us', url: 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks5_proxies.txt', protocol: 'socks5' },

  // openproxyhub/proxy-exports (~1.8k)
  { name: 'openproxyhub', url: 'https://raw.githubusercontent.com/openproxyhub/proxy-exports/main/all_proxies.txt', protocol: 'http' },

  // Skiddle-ID/proxylist (~1.9k)
  { name: 'skiddle', url: 'https://raw.githubusercontent.com/Skiddle-ID/proxylist/main/proxies.txt', protocol: 'http' },

  // itsanwar/proxy-scraper-ak (~1k)
  { name: 'itsanwar', url: 'https://raw.githubusercontent.com/itsanwar/proxy-scraper-ak/main/sproxies/ALL.txt', protocol: 'http' },

  // alphaa1111/proxyscraper (~900)
  { name: 'alphaa1111', url: 'https://raw.githubusercontent.com/alphaa1111/proxyscraper/main/proxies/http.txt', protocol: 'http' },
  { name: 'alphaa1111', url: 'https://raw.githubusercontent.com/alphaa1111/proxyscraper/main/proxies/socks.txt', protocol: 'socks5' },

  // trio666/proxy-checker (~2.1k, needs prefix strip)
  { name: 'trio666', url: 'https://raw.githubusercontent.com/trio666/proxy-checker/main/http.txt', protocol: 'http', stripPrefix: true },
  { name: 'trio666', url: 'https://raw.githubusercontent.com/trio666/proxy-checker/main/socks4.txt', protocol: 'socks4', stripPrefix: true },
  { name: 'trio666', url: 'https://raw.githubusercontent.com/trio666/proxy-checker/main/socks5.txt', protocol: 'socks5', stripPrefix: true },
];

function parseLine(line: string, stripPrefix: boolean): { host: string; port: number } | null {
  let clean = line.trim();
  if (!clean || clean.startsWith('#') || clean.startsWith('//')) return null;

  // Strip protocol prefix if needed (e.g. "socks5://1.2.3.4:1080" → "1.2.3.4:1080")
  if (stripPrefix) {
    clean = clean.replace(/^(https?|socks[45]):\/\//, '');
  }

  const [host, portStr] = clean.split(':');
  const port = parseInt(portStr, 10);
  if (!host || !port || isNaN(port) || port < 1 || port > 65535) return null;

  return { host: host.toLowerCase().trim(), port };
}

export async function scrape(): Promise<RawProxy[]> {
  const results: RawProxy[] = [];
  const fetches = SOURCES.map(async (source) => {
    try {
      const res = await axios.get<string>(source.url, { timeout: 15_000, responseType: 'text' });
      const lines = (res.data as string).split('\n');
      let count = 0;
      for (const line of lines) {
        const parsed = parseLine(line, source.stripPrefix ?? false);
        if (parsed) {
          results.push({ ...parsed, protocol: source.protocol, source: `gh:${source.name}` });
          count++;
        }
      }
      if (count > 0) log.debug(`${source.name}/${source.protocol}: ${count} proxies`);
    } catch {
      // Silent — individual source failures are expected
    }
  });

  await Promise.allSettled(fetches);
  log.info(`Fetched ${results.length} proxies from ${SOURCES.length} URLs`);
  return results;
}
