# Architecture

## Pipeline

3-phase parallel pipeline, every 20 minutes via GitHub Actions. 14 runners total.

```
SCRAPE (1 runner, ~15s)
  34 sources in parallel → dedup → blacklist dead proxies from DB
      │
      ├── SHARD 0 ──┐
      ├── SHARD 1   │
      ├── ...       │  12 runners validate in parallel
      └── SHARD 11──┘  200 concurrency each, 30s hard timeout per proxy
      │
MERGE (1 runner, ~15s)
  combine 12 shard artifacts → SQLite upsert → export files → commit
```

## Phase 1: Scrape

Entry point: `npm run pipeline:scrape` (`src/pipeline-scrape.ts`)

120+ sources run in parallel via `Promise.allSettled()`. Per-source cap configurable via `MAX_PER_SOURCE` (default 50k). Results deduplicated by `host:port`, then previously-alive proxies from the DB are injected (ensures they get re-validated even if they dropped off source lists), then filtered against the blacklist (dead proxies from last 3 hours). Output uploaded as GitHub Actions artifact.

**Source types:**
- **REST APIs (5):** ProxyScrape, Geonode, Databay, Shodan (key required), Censys (key required)
- **GitHub raw text (26):** ErcinDedeoglu (~34k), vmheaven (~19k), zevtyardt (~15k), r00tee (~13k), TheSpeedX (~7k), ProxyScraper-GH (~7k), dinoz0rg (~1k checked), jetkai (~4k), Proxifly (~3k), iplocate (~4k), sunny9577 (~2k), mmpx12 (~1.5k), Vann-Dev (~1.3k), zloi (~1.1k), ClearProxy (~800), spys.me (~800), vakhov (~700), clarketm (~400), MuRongPIG (~250 checked), casa (~50k capped), fate0 (~250), roosterkid (~230), monosans (~200), prxchk (~100), hookzof (~60)
- **Bulk GitHub (14 repos):** ebrasha (~10k), Munachukwuw (~13k), gitrecon1455 (~10k), proxygenerator1 (~8k), dpangestuw (~7k), officialputuid (~4k), TuanMinPay (~3k), komutan234 (~3k), Anonym0usWork1221 (~3.6k), openproxyhub (~1.8k), Skiddle-ID (~1.9k), itsanwar (~1k), alphaa1111 (~900), trio666 (~2.1k)
- **Meta-source (76 URLs):** acidvegas/proxytools proxy_sources.txt — curated list of API endpoints and raw URLs, all fetched in parallel
- **HTML scraping (1):** free-proxy-list.net family (4 sites, regex IP:port extraction)
- **Active probing (1):** Scanner (TCP probe + fingerprinting, disabled by default)

**Fetcher contract:** `export async function scrape(): Promise<RawProxy[]>`

Registered in a declarative array in `src/scrapers/index.ts`.

## Blacklist

Queries SQLite DB (cached between Actions runs) for proxies where `alive = 0` and `last_checked` within the last 3 hours (`BLACKLIST_WINDOW_SEC`). Filters them out before validation.

- **Cold start:** No DB cache, validates everything
- **Warm runs:** Skips ~80% of dead proxies, only validates new + previously-alive
- **3-hour window:** Dead proxies eventually become eligible for retry

## Phase 2: Validate (12 shards)

Entry point: `npm run pipeline:validate` (`src/pipeline-validate.ts`)

Downloads the proxy list artifact, takes its slice (shard N of 12), validates each proxy.

**Per-proxy checks:**

| Check | Endpoint | Pass |
|-------|----------|------|
| Alive | Judge server or httpbin.org/ip | HTTP 200 |
| Anonymity | Judge echoed headers | elite/anonymous/transparent |
| Latency | `Date.now()` delta | Recorded in ms |
| Google Pass | google.com/generate_204 | HTTP 204 |
| Hijack (5 types) | httpbin.org/get | Response structure intact |
| Discord | discord.com/api/v10/gateway | HTTP 200 |
| TikTok | tiktok.com/robots.txt | HTTP 2xx/3xx |
| Instagram | instagram.com/robots.txt | HTTP 2xx/3xx |
| X/Twitter | x.com/robots.txt | HTTP 2xx/3xx |
| Reddit | reddit.com/robots.txt | HTTP 2xx/3xx |
| Geolocation | MaxMind GeoLite2 or free API | Country + ASN |

**Safety mechanisms:**
- 30s hard timeout per proxy via `withHardTimeout()` — kills hung sockets unconditionally
- 150 min global deadline via `Promise.race()` — returns partial results if hit
- 200 concurrent connections via `p-limit`
- Results stream to text files in real-time via `onResult` callback

Each shard uploads its validated results as a GitHub Actions artifact.

## Phase 3: Merge

Entry point: `npm run pipeline:merge` (`src/pipeline-merge.ts`)

Downloads all 12 shard artifacts, merges, filters invalid entries (bad ports), stores to SQLite via upsert, runs full export, commits to repo.

**Export outputs:**
- `proxies/` — flat text by protocol, speed tier, anonymity, site
- `proxies/by-site/` — per-platform lists (google, discord, tiktok, instagram, x, reddit)
- `proxies/hijacked.*` + `malicious-asn.txt` — threat intel
- `data/proxies.json` + `data/stats.json` — structured data
- README stats + badges auto-updated
- CHANGELOG.md appended with deltas

## Deployment

### GitHub Actions (Primary)

Every 20 minutes, 14 runners, $0 cost (public repo).

**Caches persisted between runs:**
- `worldpool.db` — proxy database (blacklist, reliability tracking) — `save-always: true`
- `data/*.mmdb` — GeoLite2 databases — `save-always: true`

**Safety:**
- `concurrency` group prevents overlapping runs
- `fail-fast: false` on validation matrix
- `if: always()` on merge job (runs even if some shards fail)
- GeoLite2 download is non-fatal (free API fallback)

### Local / VPS (Optional)

`npm run pipeline` runs the original single-runner pipeline.
`npm start` starts API server + background pipeline.

## Tendril: Distributed Validation

Optional P2P layer via Hyperswarm (`TENDRIL_ENABLED=true`). Nodes validate from their own region, storing results in `regional_validation` table. Uses Vector Clocks for job causality and PN-Counters for completion tracking. Public topic blocks auth headers.

## Threat Model

See [SECURITY.md](SECURITY.md).
