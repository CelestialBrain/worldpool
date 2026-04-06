# Worldpool

<!-- BADGES_START -->
![Alive](https://img.shields.io/badge/alive-932-brightgreen)
![Google Pass](https://img.shields.io/badge/google--pass-550-blue)
![Hijacked Blocked](https://img.shields.io/badge/hijacked--blocked-12714-red)
![Avg Latency](https://img.shields.io/badge/avg--latency-2415ms-yellow)
![Reliability](https://img.shields.io/badge/reliability-1.9%25-purple)
![Updated](https://img.shields.io/badge/updated-2026--04--06-lightgrey)
<!-- BADGES_END -->

**Global proxy pool. Self-maintaining, free, open.**

Worldpool aggregates proxies from 34 sources, validates every one for liveness, anonymity, latency, hijack detection, and site-specific reachability (Google, Discord, TikTok, Instagram, X, Reddit), then exports curated lists and serves them via a REST API. Runs every 20 minutes on GitHub Actions using 12 parallel validation runners.

---

## Pipeline

```
SCRAPE (1 runner, ~15s)
  34 sources → deduplicate → blacklist recently-dead proxies
    │
    ├── SHARD 0  ──┐
    ├── SHARD 1    │
    ├── SHARD 2    │
    ├── SHARD 3    │
    ├── SHARD 4    │  12 runners validate in parallel
    ├── SHARD 5    │  alive + anonymity + latency + hijack detect
    ├── SHARD 6    │  + Google + Discord + TikTok + IG + X + Reddit
    ├── SHARD 7    │  results stream to text files in real-time
    ├── SHARD 8    │
    ├── SHARD 9    │
    ├── SHARD 10   │
    └── SHARD 11 ──┘
    │
MERGE (1 runner, ~15s)
  combine shards → store to DB → export files → update README → commit
```

**Cold start:** ~20-25 min. **Warm (blacklist active):** ~10 min. **Every 20 minutes. $0 cost (public repo).**

---

## Sources (34)

| Source | Est. Proxies | Update Freq |
|--------|-------------|-------------|
| ErcinDedeoglu/proxies | ~37k | Hourly |
| vmheaven/VMHeaven | ~19k | Every 15 min |
| zevtyardt/proxy-list | ~15k | Daily |
| r00tee/Proxy-List | ~10k | Every 5 min |
| TheSpeedX/PROXY-List | ~8k | Hourly |
| ProxyScraper/ProxyScraper | ~8k | Every 30 min |
| dinoz0rg/proxy-list | ~5k (checked) | Every 2 hours |
| jetkai/proxy-list | ~4k | Hourly |
| Proxifly | ~3k | Every 5 min |
| iplocate/free-proxy-list | ~2.5k | Every 30 min |
| sunny9577 | ~2.2k | Frequent |
| mmpx12/proxy-list | ~1.5k | Hourly |
| Vann-Dev/proxy-list | ~1.5k | Site-checked |
| zloi-user/hideip.me | ~1.3k | Every 10 min |
| Databay API | ~1k | Every 10 min |
| free-proxy-list.net (4 sites) | ~900 | Every 10 min |
| ProxyScrape API | ~900 | Real-time |
| ClearProxy | ~800 | Every 5 min |
| spys.me | ~800 | Hourly |
| vakhov | ~700 | Every 5-20 min |
| Geonode API | ~500 | Every 5 min |
| clarketm | ~400 | Curated |
| fyvri | ~300+ | Hourly |
| MuRongPIG | ~300+ | Frequent |
| casa-ls | ~300+ | Every 5 min |
| Fate0 | ~250 | JSONL |
| roosterkid | ~230 | Hourly |
| Monosans | ~200 | Hourly |
| prxchk | ~100 | Every 10 min |
| Hookzof | ~90 | SOCKS5 only |
| Shodan API | Varies | Requires key |
| Censys API | Varies | Requires key |
| Scanner | Varies | Disabled by default |

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

### Threat Intel
| File | Description |
|------|-------------|
| [`proxies/hijacked.txt`](proxies/hijacked.txt) | Hijacked proxy IPs |
| [`proxies/hijacked.json`](proxies/hijacked.json) | Full hijack details with classification |
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
| Total proxies | 49401 |
| Alive proxies | 932 |
| Elite proxies | 932 |
| Google pass | 550 |
| Hijacked | 12714 |
| Avg latency | 2415 ms |
| Last updated | 2026-04-06T14:34:42.000Z |
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
| `MAX_PER_SOURCE` | `50000` | Cap proxies per source |
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

### Parallel Validation (GitHub Actions)

3-phase pipeline across 14 runners:

1. **Scrape** (1 runner, ~15s) — 34 sources, dedup, blacklist, upload artifact
2. **Validate** (12 runners in parallel, ~5-20 min) — each shard validates a slice at 200 concurrency with 30s hard timeout, streams to text files, uploads artifact
3. **Merge** (1 runner, ~15s) — combine shards, store to SQLite, export, commit

### Blacklist

SQLite DB cached between runs. Dead proxies from the last 3 hours are skipped. First run validates everything; subsequent runs skip ~80% of dead proxies.

### Safety

- 30s hard timeout per proxy (no hung connections)
- 150 min global validation deadline
- `fail-fast: false` on matrix (one shard failing doesn't kill others)
- `save-always: true` on DB cache (saves even on timeout/cancel)
- `if: always()` on commit and merge (partial results still saved)
- Concurrency group prevents overlapping runs

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
