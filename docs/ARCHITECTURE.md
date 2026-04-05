# Architecture

## Pipeline

5-stage pipeline, hourly via GitHub Actions.

```
SCRAPE ──▶ DEDUP ──▶ VALIDATE ──▶ STORE ──▶ EXPORT
34 sources   host:port   judge/httpbin   SQLite    txt/json
in parallel  normalize   anonymity       upsert    per-site
(50k cap)    first wins  hijack detect   uptime    stats
                         site-pass                 README
```

## Stage 1: Scrape

34 sources run in parallel via `Promise.allSettled()`. Each source has its own module in `src/scrapers/`. Safety cap of 50k proxies per source.

**Source types:**
- **REST APIs (5):** ProxyScrape, Geonode, Databay, Shodan, Censys
- **GitHub raw text (26):** ErcinDedeoglu (~37k), vmheaven (~19k), zevtyardt (~15k), r00tee (~10k), TheSpeedX (~8k), ProxyScraper-GH (~8k), dinoz0rg (~5k checked), jetkai (~4k), Proxifly (~3k), iplocate (~2.5k), sunny9577 (~2.2k), mmpx12 (~1.5k), Vann-Dev (~1.5k), zloi (~1.3k), ClearProxy (~800), spys.me (~800), vakhov (~700), Geonode (~500), clarketm (~400), fyvri (~300+), MuRongPIG (~300+), casa (~300+), fate0 (~250), roosterkid (~230), monosans (~200), prxchk (~100), hookzof (~90)
- **HTML scraping (1):** free-proxy-list.net family (4 sites, regex extraction)
- **Active probing (1):** Scanner (TCP port probe + fingerprinting, disabled by default)

**Fetcher contract:** `export async function scrape(): Promise<RawProxy[]>`

Sources are registered in a declarative array in `src/scrapers/index.ts`:
```typescript
const scrapers = [
  { name: 'proxyscrape', fn: proxyscrape },
  { name: 'ercin', fn: ercin },
  // ... 32 more
];
```

## Stage 2: Deduplicate

Normalize host to lowercase, key by `host:port`, first-seen wins.

## Stage 3: Validate

Concurrent validation via `p-limit` (default 100, max 200 connections).

**Checks per proxy:**

| Check | Endpoint | Pass |
|-------|----------|------|
| Alive | Judge server or httpbin.org/ip | HTTP 200 |
| Anonymity | Judge echoed headers | elite/anonymous/transparent |
| Latency | `Date.now()` delta | Recorded in ms |
| Google Pass | google.com/generate_204 | HTTP 204 |
| Hijack (5 types) | httpbin.org/get | Response matches expected structure |
| Discord | discord.com/api/v10/gateway | HTTP 200 |
| TikTok | tiktok.com/robots.txt | HTTP 2xx/3xx |
| Instagram | instagram.com/robots.txt | HTTP 2xx/3xx |
| X/Twitter | x.com/robots.txt | HTTP 2xx/3xx |
| Reddit | reddit.com/robots.txt | HTTP 2xx/3xx |
| Geolocation | MaxMind GeoLite2 or free API | Country + ASN |

**Hijack categories:** ad_injection, redirect, captive_portal, content_substitution, ssl_strip

## Stage 4: Store

SQLite with WAL mode. Upsert by `proxy_id` (`host:port`).

- `check_count` / `alive_count` tracked over time
- `reliability_pct` = alive_count / check_count * 100
- `site_pass` stored as JSON column

## Stage 5: Export

- `proxies/` — flat text by protocol, speed, anonymity, site
- `proxies/by-site/` — per-platform proxy lists (google, discord, tiktok, instagram, x, reddit)
- `proxies/hijacked.*` + `malicious-asn.txt` — threat intel
- `data/proxies.json` + `data/stats.json` — structured data
- README stats + badges auto-updated
- CHANGELOG.md appended with deltas

## Deployment

**GitHub Actions (primary):** Hourly cron, GeoLite2 databases cached between runs via `actions/cache`. Download step is non-fatal (free API fallback).

**Local/VPS (optional):** `npm start` for API + background pipeline.

## Tendril: Distributed Validation

Optional P2P layer via Hyperswarm. Nodes validate from their own region, storing results in `regional_validation` table.

- Vector Clocks for job causality
- PN-Counters for completion tracking
- Public topic blocks auth headers (credential safety)

See [SECURITY.md](SECURITY.md) for threat model.
