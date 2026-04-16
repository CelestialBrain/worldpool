# Worldpool

<!-- BADGES_START -->
![Alive](https://img.shields.io/badge/alive-1604-brightgreen)
![Google Pass](https://img.shields.io/badge/google--pass-1364-blue)
![Hijacked Blocked](https://img.shields.io/badge/hijacked--blocked-209845-red)
![Avg Latency](https://img.shields.io/badge/avg--latency-3011ms-yellow)
![Reliability](https://img.shields.io/badge/reliability-3.1%25-purple)
![Updated](https://img.shields.io/badge/updated-2026--04--16-lightgrey)
<!-- BADGES_END -->

**Global proxy pool. Self-maintaining, free, open.**

Worldpool aggregates proxies from 120+ sources (34 direct scrapers + 14 bulk GitHub repos + 76 meta-source URLs), validates every one for liveness, anonymity, latency, hijack detection, and site-specific reachability (Google, Discord, TikTok, Instagram, X, Reddit), then exports curated lists and serves them via a REST API. Runs every 20 minutes on GitHub Actions using 12 parallel validation runners.

---

## Pipeline

```
SCRAPE (1 runner, ~15s)
  120+ sources → dedup → inject alive proxies from DB → blacklist dead
    │
    ├── SHARD 0  ──┐
    ├── SHARD 1    │
    ├── ...        │  12 runners validate in parallel
    └── SHARD 11 ──┘  alive + anonymity + latency + hijack + site-pass
    │
MERGE (1 runner, ~15s)
  combine shards → store to DB → export files → commit
```

**Warm runs:** ~5-10 min. **Every 20 minutes. $0 cost (public repo).**

---

## Sources (120+)

Actual counts from latest pipeline run (auto-updated):

| Source | Proxies | Update Freq |
|--------|---------|-------------|
| casa-ls/proxy-list | 50,000 (capped) | Every 5 min |
| ErcinDedeoglu/proxies | 33,607 | Hourly |
| vmheaven/VMHeaven | 19,186 | Every 15 min |
| zevtyardt/proxy-list | 15,412 | Daily |
| r00tee/Proxy-List | 12,923 | Every 5 min |
| TheSpeedX/PROXY-List | 6,820 | Hourly |
| ProxyScraper/ProxyScraper | 6,820 | Every 30 min |
| iplocate/free-proxy-list | 3,797 | Every 30 min |
| jetkai/proxy-list | 3,809 | Hourly |
| Proxifly | 3,169 | Every 5 min |
| sunny9577 | 1,857 | Frequent |
| mmpx12/proxy-list | 1,493 | Hourly |
| Vann-Dev/proxy-list | 1,291 | Site-checked |
| zloi-user/hideip.me | 1,137 | Every 10 min |
| Databay API | 1,000 | Every 10 min |
| dinoz0rg/proxy-list | 922 | Every 2 hours |
| free-proxy-list.net (4 sites) | 900 | Every 10 min |
| ProxyScrape API | 870 | Real-time |
| ClearProxy | 807 | Every 5 min |
| spys.me | 800 | Hourly |
| vakhov | 723 | Every 5-20 min |
| Geonode API | 500 | Every 5 min |
| clarketm | 400 | Curated |
| Fate0 | 251 | JSONL |
| MuRongPIG (checked) | 244 | Frequent |
| roosterkid | 231 | Hourly |
| Monosans | 196 | Hourly |
| prxchk | 100 | Every 10 min |
| Hookzof | 63 | SOCKS5 only |
| Shodan API | — | Requires key |
| Censys API | — | Requires key |

**Bulk GitHub sources (14 repos in single scraper):**
ebrasha (~10k), Munachukwuw (~13k), gitrecon1455 (~10k), proxygenerator1 (~8k), dpangestuw (~7k), officialputuid (~4k), TuanMinPay (~3k), komutan234 (~3k), Anonym0usWork1221 (~3.6k), openproxyhub (~1.8k), Skiddle-ID (~1.9k), itsanwar (~1k), alphaa1111 (~900), trio666 (~2.1k)

**Meta-source scraper:** Fetches [acidvegas/proxytools](https://github.com/acidvegas/proxytools) proxy_sources.txt — 76 curated API endpoints and raw URLs, scraped in parallel.

**Country-specific API scraper:** Hits ProxyScrape, Databay, and Geonode with country filters for PH, ID, TH, VN, MY, BD, PK, KH, MM — underrepresented countries in global proxy lists. Currently contributes ~2.4k proxies per run.

**Scanner-file:** Reads `data/scanner-discovered.txt` (legacy from the VPS scanner, ~195k entries). The VPS is discontinued but the file remains as historical data for the blacklist.

---

## Validation

Every proxy gets a 30-second hard timeout and these checks:

| Check | What it does |
|-------|-------------|
| **Alive** | HTTP request through proxy to judge server or httpbin.org |
| **Anonymity** | Classifies as elite, anonymous, or transparent |
| **Latency** | Round-trip time in milliseconds |
| **Google Pass** | Can the proxy reach `google.com/generate_204`? |
| **Hijack Detection** | 5 types: ad injection, redirect, captive portal, content substitution, SSL strip |
| **Site Pass** | Tests Discord, TikTok, Instagram, X/Twitter, Reddit reachability |
| **Geolocation** | Country + ASN via MaxMind GeoLite2 or free API |

---

## Proxy Files

Updated every 20 minutes via GitHub Actions.

### By Protocol
| File | Description |
|------|-------------|
| [`proxies/all.txt`](proxies/all.txt) | All alive proxies |
| [`proxies/http.txt`](proxies/http.txt) | HTTP proxies |
| [`proxies/socks4.txt`](proxies/socks4.txt) | SOCKS4 proxies |
| [`proxies/socks5.txt`](proxies/socks5.txt) | SOCKS5 proxies |

### By Quality
| File | Description |
|------|-------------|
| [`proxies/elite.txt`](proxies/elite.txt) | Elite anonymity |
| [`proxies/google-pass.txt`](proxies/google-pass.txt) | Passes Google |
| [`proxies/by-anonymity/elite.txt`](proxies/by-anonymity/elite.txt) | Elite |
| [`proxies/by-anonymity/anonymous.txt`](proxies/by-anonymity/anonymous.txt) | Anonymous |

### By Speed
| File | Description |
|------|-------------|
| [`proxies/by-speed/turbo.txt`](proxies/by-speed/turbo.txt) | < 200ms |
| [`proxies/by-speed/fast.txt`](proxies/by-speed/fast.txt) | 200-500ms |
| [`proxies/by-speed/medium.txt`](proxies/by-speed/medium.txt) | 500-2000ms |
| [`proxies/by-speed/slow.txt`](proxies/by-speed/slow.txt) | > 2000ms |

### By Site
| File | Description |
|------|-------------|
| [`proxies/by-site/google.txt`](proxies/by-site/google.txt) | Works with Google |
| [`proxies/by-site/discord.txt`](proxies/by-site/discord.txt) | Works with Discord |
| [`proxies/by-site/tiktok.txt`](proxies/by-site/tiktok.txt) | Works with TikTok |
| [`proxies/by-site/instagram.txt`](proxies/by-site/instagram.txt) | Works with Instagram |
| [`proxies/by-site/x.txt`](proxies/by-site/x.txt) | Works with X/Twitter |
| [`proxies/by-site/reddit.txt`](proxies/by-site/reddit.txt) | Works with Reddit |

### By Country
| File | Description |
|------|-------------|
| [`proxies/by-country/PH.txt`](proxies/by-country/PH.txt) | Philippines |
| [`proxies/by-country/US.txt`](proxies/by-country/US.txt) | United States |
| [`proxies/by-country/CN.txt`](proxies/by-country/CN.txt) | China |
| [`proxies/by-country/DE.txt`](proxies/by-country/DE.txt) | Germany |
| [`proxies/by-country/JP.txt`](proxies/by-country/JP.txt) | Japan |
| [`proxies/by-country/KR.txt`](proxies/by-country/KR.txt) | South Korea |
| [`proxies/by-country/SG.txt`](proxies/by-country/SG.txt) | Singapore |
| [`proxies/by-country/IN.txt`](proxies/by-country/IN.txt) | India |
| [`proxies/by-country/RU.txt`](proxies/by-country/RU.txt) | Russia |
| [`proxies/by-country/GB.txt`](proxies/by-country/GB.txt) | United Kingdom |
| + BR, FR, HK, TH, VN, ID | |

### Threat Intel
| File | Description |
|------|-------------|
| [`proxies/hijacked.txt`](proxies/hijacked.txt) | Hijacked proxy IPs (207k+) |
| [`proxies/malicious-asn.txt`](proxies/malicious-asn.txt) | ASNs ranked by hijacked count |

### Structured Data
| File | Description |
|------|-------------|
| [`data/proxies.json`](data/proxies.json) | Full proxy list with all metadata |
| [`data/stats.json`](data/stats.json) | Pool health with source quality metrics |

---

## API

REST API on port 3000. Rate limited to 60 req/min per IP.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/proxies` | GET | Filtered proxy list. Params: `protocol`, `anonymity`, `google_pass`, `max_latency_ms`, `limit`, `offset`, `format` |
| `/proxies/random` | GET | Single random proxy. Same filters |
| `/stats` | GET | Pool health and protocol breakdown |
| `/refresh` | POST | Trigger pipeline. Requires `X-Admin-Token`. 10-min timeout |
| `/optout` | POST | Exclude IP/CIDR from scanner |

---

## Pool Statistics

<!-- STATS_START -->
| Metric | Value |
| --- | --- |
| Total proxies | 619913 |
| Alive proxies | 1604 |
| Elite proxies | 1604 |
| Google pass | 1364 |
| Hijacked | 209845 |
| Avg latency | 3011 ms |
| Last updated | 2026-04-16T22:13:25.000Z |
<!-- STATS_END -->

---

## Quick Start

```bash
npm install
npm run pipeline           # full pipeline (single runner)
npm run pipeline:scrape    # phase 1: scrape only
npm run pipeline:validate  # phase 2: validate a shard
npm run pipeline:merge     # phase 3: merge results
npm run dev                # API server
npm start                  # pipeline + API
```

### Test Proxies

```bash
npx tsx src/test-proxies.ts 10 proxies/google-pass.txt
npx tsx src/test-proxies.ts 5 proxies/by-site/discord.txt
npx tsx src/test-proxies.ts 10 proxies/by-speed/fast.txt
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VALIDATOR_CONCURRENCY` | `100` | Parallel connections (CI uses 200) |
| `VALIDATOR_TIMEOUT_MS` | `5000` | Per-proxy axios timeout |
| `MAX_PER_SOURCE` | `0` (no cap) | Cap proxies per source (0 = unlimited) |
| `BLACKLIST_WINDOW_SEC` | `10800` | Skip dead proxies checked within 3h |
| `SKIP_GOOGLE_PASS` | `false` | Skip Google 204 check |
| `SKIP_SITE_PASS` | `false` | Skip Discord/TikTok/IG/X/Reddit checks |
| `JUDGE_URL` | `localhost:3001/judge` | Judge server for anonymity |
| `JUDGE_TOKEN` | `dev-token` | Judge server auth |
| `MAXMIND_LICENSE_KEY` | — | Enables offline geolocation |
| `SHODAN_API_KEY` | — | Enables Shodan source |
| `CENSYS_API_ID` / `SECRET` | — | Enables Censys source |
| `SCANNER_ENABLED` | `false` | Enable active port scanner |
| `TENDRIL_ENABLED` | `false` | Enable P2P distributed validation |

---

## Architecture

### GitHub Actions Pipeline

3-phase pipeline across 14 runners, every 20 minutes:

1. **Scrape** (1 runner, ~15s) — 120+ sources, dedup, inject alive proxies from DB, blacklist dead, upload artifact
2. **Validate** (12 runners in parallel, ~5-20 min) — 200 concurrency, 30s hard timeout, site-pass checks, streams to text files
3. **Merge** (1 runner, ~15s) — combine shards, store to SQLite, export, commit

### Blacklist

SQLite DB cached between Actions runs. Dead proxies from the last 3 hours are skipped. Subsequent runs only validate new + previously-alive proxies (~80% reduction).

### Safety & Guardrails

- 30s hard timeout per proxy (no hung connections)
- 150 min global validation deadline
- `fail-fast: false` on matrix (one shard failing doesn't kill others)
- `if: always()` on commit and merge (partial results still saved)
- Concurrency group prevents overlapping Actions runs
- `git pull --rebase` before push (handles concurrent commits)

---

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22+ (TypeScript, ESM) |
| HTTP | Hono |
| Database | SQLite (better-sqlite3, WAL) |
| P2P | Hyperswarm + CRDTs |
| Geolocation | MaxMind GeoLite2 |
| CI/CD | GitHub Actions (12 shards, every 20 min, $0) |

---

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

- Hijack detection (5 categories) blocks tampered proxies
- Site-pass checks verify platform reachability
- Rate limiting on all API endpoints (60 req/min)
- 30s hard timeout prevents hung connections
- Judge server token auth
- Opt-out system for IP operators
- Free proxies are untrusted — never route credentials through them

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).
