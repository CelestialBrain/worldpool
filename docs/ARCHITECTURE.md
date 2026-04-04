# Architecture

Technical deep-dive into Worldpool's pipeline, validation strategy, and deployment model.

## Pipeline Overview

Worldpool runs a 5-stage pipeline every hour via GitHub Actions.

```
SCRAPE ──▶ DEDUP ──▶ VALIDATE ──▶ STORE ──▶ EXPORT
34 sources   host:port   judge/httpbin   SQLite    txt/json
in parallel  normalize   google 204      upsert    per-site
                         latency                   stats
                         hijack detect             README
                         site-pass checks
```

## Stage 1: Scrape

Each source has its own fetcher in `src/scrapers/`. All 34 run in parallel via `Promise.allSettled()` — one source failing doesn't block the others. Sources are registered in a declarative array in `src/scrapers/index.ts`.

### Source Categories

**REST APIs (5):** ProxyScrape, Geonode, Databay, Shodan (requires key), Censys (requires key)

**GitHub Repos — Raw Text (26):** ErcinDedeoglu (~39k), fyvri (~15k), vmheaven (~15k), MuRongPIG (~8k), iplocate (~8k), TheSpeedX (~7k), zevtyardt (~10k), dinoz0rg (~10k), r00tee (~5k), casa-ls (~5k), ProxyScraper-GH (~5k), Proxifly (~3k), jetkai (~3k), sunny9577 (~1.8k), Vann-Dev (~1.5k), mmpx12 (~1k), vakhov (~900), ClearProxy (~800), monosans (~500), clarketm (~400), fate0 (~250, JSONL), prxchk (~100), hookzof (~100, SOCKS5), roosterkid (~200), zloi-user (host:port:country format), spys.me (custom format with anonymity data)

**HTML Scraping (1):** free-proxy-list.net family (4 sites: free-proxy-list.net, sslproxies.org, us-proxy.org, socks-proxy.net). Uses regex extraction from HTML tables.

**Active Probing (1):** Scanner — TCP port-scans IP ranges from `data/scan-targets.txt`. Disabled by default.

### Fetcher Contract

Every scraper module exports:

```typescript
export async function scrape(): Promise<RawProxy[]>
```

## Stage 2: Deduplicate

1. Normalize host to lowercase, trim whitespace
2. Generate key as `{host}:{port}`
3. First-seen wins (preserves richer metadata from structured sources)

## Stage 3: Validate

Uses `p-limit` to cap concurrent outbound connections.

### Checks Performed

| Check | Method | Pass Condition |
|-------|--------|---------------|
| **Alive** | HTTP GET through proxy to judge server | HTTP 200 within timeout |
| **Anonymity** | Parse returned headers from judge | elite / anonymous / transparent |
| **Google Pass** | GET `https://www.google.com/generate_204` | HTTP 204 |
| **Latency** | `Date.now()` delta around alive check | Recorded in ms |
| **Hijack Detection** | Probe against httpbin.org/get | 5 categories |
| **Site Pass** | Test Discord, TikTok, Instagram, X, Reddit | Per-site pass/fail |
| **Geolocation** | MaxMind GeoLite2 or free API fallback | Country + ASN |

### Hijack Detection

| Category | Description |
|----------|-------------|
| `ad_injection` | Proxy injects advertising scripts/content |
| `redirect` | Proxy redirects to a different destination |
| `captive_portal` | Proxy presents a login/portal page |
| `content_substitution` | Proxy modifies response body |
| `ssl_strip` | Proxy strips TLS from HTTPS connections |

### Site-Pass Checks

Each alive proxy is tested against popular platforms using lightweight endpoints:

| Site | Endpoint | Pass Condition |
|------|----------|---------------|
| Discord | `https://discord.com/api/v10/gateway` | HTTP 200 |
| TikTok | `https://www.tiktok.com/robots.txt` | HTTP 2xx/3xx |
| Instagram | `https://www.instagram.com/robots.txt` | HTTP 2xx/3xx |
| X/Twitter | `https://x.com/robots.txt` | HTTP 2xx/3xx |
| Reddit | `https://www.reddit.com/robots.txt` | HTTP 2xx/3xx |

Results stored as JSON in the `site_pass` column and exported to `proxies/by-site/{site}.txt`.

### Concurrency Model

```
Main thread
  └── p-limit(100) ← configurable via VALIDATOR_CONCURRENCY
        ├── validateProxy(proxy1) → alive + anonymity + hijack + site-pass
        ├── validateProxy(proxy2) → ...
        └── ... (up to 100 concurrent)
```

## Stage 4: Store

SQLite with WAL mode. `proxy` table upserted by `proxy_id` (natural key = `host:port`).

- New proxies get inserted
- Known proxies get their validation results updated
- `reliability_pct` = `alive_count / check_count * 100`
- `site_pass` stored as JSON string column

## Stage 5: Export

1. **Flat text files** in `proxies/` — by protocol, speed tier, anonymity
2. **Site-pass files** in `proxies/by-site/` — per-platform proxy lists
3. **Threat-intel files** — hijacked proxies, malicious ASNs
4. **JSON exports** in `data/` — full data + stats snapshot
5. **README update** — stats section + badges
6. **CHANGELOG append** — run deltas

## Deployment

### GitHub Actions (Primary)

```yaml
schedule:
  - cron: '0 * * * *'  # every hour (unlimited for public repos)
```

### Local / VPS (Optional)

Run `npm start` for real-time API access with background pipeline.

**Rule:** Never run the validator on the same VPS as production apps.

## Tendril: Distributed Validation

Optional P2P layer (`TENDRIL_ENABLED=true`). Distributes proxy validation across volunteer nodes via Hyperswarm DHT. Produces geo-scoped availability data in the `regional_validation` table.

See the README for SDK usage and security model.

## Threat Model

See [SECURITY.md](SECURITY.md) for the full threat analysis.
