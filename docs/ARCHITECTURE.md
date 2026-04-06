# Architecture

## Pipeline

6-stage pipeline, hourly via GitHub Actions. SQLite DB cached between runs.

```
SCRAPE ──▶ DEDUP ──▶ BLACKLIST ──▶ VALIDATE ──▶ STORE ──▶ EXPORT
34 sources   host:port   skip dead      judge/httpbin   SQLite    txt/json
in parallel  normalize   proxies from   anonymity       upsert    per-site
(5k cap)     first wins  last 3 hours   hijack detect   uptime    stats
                                        stream to txt             README
```

## Stage 1: Scrape

34 sources run in parallel via `Promise.allSettled()`. Each source has its own module in `src/scrapers/`. Per-source cap configurable via `MAX_PER_SOURCE` (default 5k).

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

## Stage 2.5: Blacklist

Queries the SQLite DB for proxies that were confirmed dead within the last 3 hours (configurable via `BLACKLIST_WINDOW_SEC`). These are filtered out before validation — no point re-checking a proxy that was dead 1 hour ago.

- **Run 1 (cold):** No DB, validates everything (~20k proxies)
- **Run 2+ (warm):** Skips ~80% of scraped proxies, validates ~3-5k in ~15-20 min
- **After 3 hours:** Dead proxies become eligible for retry (they might have come back)
- DB is cached between GitHub Actions runs via `actions/cache`

## Stage 3: Validate

Concurrent validation via `p-limit` (default 100, CI uses 200). Results stream to text files in real-time via `onResult` callback — proxy files populate progressively during validation, not just at the end.

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

**GitHub Actions (primary):** Hourly cron, 90-min timeout, 200 concurrency. Two caches persist between runs:
- `worldpool.db` — proxy database (enables blacklist, reliability tracking)
- `data/*.mmdb` — GeoLite2 databases (avoids re-downloading every hour)

GeoLite2 download step is non-fatal (free API fallback). Site-pass checks disabled in CI for speed (`SKIP_SITE_PASS=true`).

**Local/VPS (optional):** `npm start` for API + background pipeline.

## Tendril: Distributed Validation

Optional P2P layer via Hyperswarm. Nodes validate from their own region, storing results in `regional_validation` table.

- Vector Clocks for job causality
- PN-Counters for completion tracking
- Public topic blocks auth headers (credential safety)

See [SECURITY.md](SECURITY.md) for threat model.
