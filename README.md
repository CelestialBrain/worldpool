# Worldpool

<!-- BADGES_START -->
![Alive](https://img.shields.io/badge/alive-951-brightgreen)
![Google Pass](https://img.shields.io/badge/google--pass-366-blue)
![Hijacked Blocked](https://img.shields.io/badge/hijacked--blocked-4504-red)
![Avg Latency](https://img.shields.io/badge/avg--latency-2882ms-yellow)
![Reliability](https://img.shields.io/badge/reliability-3.8%25-purple)
![Updated](https://img.shields.io/badge/updated-2026--04--06-lightgrey)
<!-- BADGES_END -->

**Global proxy pool. Self-maintaining, free, open.**

Worldpool aggregates proxies from 34 sources, validates every one for liveness, anonymity, latency, hijack detection, and site-specific reachability (Google, Discord, TikTok, Instagram, X, Reddit), then exports curated lists and serves them via a REST API. Runs hourly on GitHub Actions.

---

## Pipeline

```
SCRAPE ───── 34 sources in parallel (5k cap per source)
  │
DEDUP ────── normalize host:port, first-seen wins
  │
BLACKLIST ── skip proxies confirmed dead within last 3 hours (DB cached across runs)
  │
VALIDATE ─── alive, anonymity, latency, hijack detection, site-pass checks
  │            results stream to text files in real-time
  ├── [optional] TENDRIL ── P2P distributed validation from multiple regions
  │
STORE ────── SQLite upsert, reliability tracking over time
  │
EXPORT ───── text files by protocol/speed/site/anonymity, JSON, stats
```

First run validates all scraped proxies (~20k). Subsequent runs skip recently-dead proxies and only validate new + previously-alive ones (~3-5k), completing in ~15-20 minutes instead of hours.

---

## Sources

34 sources running in parallel. Each source failing doesn't block the others. Per-source cap of 50k proxies to prevent memory issues.

| Source | Type | Proxies | Update Freq |
|--------|------|---------|-------------|
| ErcinDedeoglu/proxies | GitHub | ~37k | Hourly |
| vmheaven/VMHeaven | GitHub | ~19k | Every 15 min |
| zevtyardt/proxy-list | GitHub | ~15k | Daily |
| r00tee/Proxy-List | GitHub | ~10k | Every 5 min |
| TheSpeedX/PROXY-List | GitHub | ~8k | Hourly |
| ProxyScraper/ProxyScraper | GitHub | ~8k | Every 30 min |
| dinoz0rg/proxy-list | GitHub | ~5k (checked) | Every 2 hours |
| jetkai/proxy-list | GitHub | ~4k | Hourly |
| Proxifly | GitHub | ~3k | Every 5 min |
| iplocate/free-proxy-list | GitHub | ~2.5k | Every 30 min |
| sunny9577/proxy-scraper | GitHub | ~2.2k | Frequent |
| mmpx12/proxy-list | GitHub | ~1.5k | Hourly |
| Vann-Dev/proxy-list | GitHub | ~1.5k | Site-checked |
| zloi-user/hideip.me | GitHub | ~1.3k | Every 10 min |
| Databay | API | ~1k | Every 10 min |
| free-proxy-list.net (4 sites) | HTML | ~900 | Every 10 min |
| ProxyScrape | API | ~900 | Real-time |
| ClearProxy/checked-proxy-list | GitHub | ~800 | Every 5 min |
| spys.me | Web | ~800 | Hourly |
| vakhov/fresh-proxy-list | GitHub | ~700 | Every 5-20 min |
| Geonode | API | ~500 | Every 5 min |
| clarketm/proxy-list | GitHub | ~400 | Curated |
| fyvri/fresh-proxy-list | GitHub | ~300+ | Hourly |
| MuRongPIG/Proxy-Master | GitHub | ~300+ | Frequent |
| casa-ls/proxy-list | GitHub | ~300+ | Every 5 min |
| Fate0/proxylist | GitHub | ~250 | JSONL |
| roosterkid/openproxylist | GitHub | ~230 | Hourly |
| Monosans | GitHub | ~200 | Hourly |
| prxchk/proxy-list | GitHub | ~100 | Every 10 min |
| Hookzof/socks5_list | GitHub | ~90 | SOCKS5 only |
| Shodan | API | Varies | Requires API key |
| Censys | API | Varies | Requires API key |
| Scanner | Active probe | Varies | Disabled by default |

---

## Validation

Every proxy goes through these checks:

| Check | What it does |
|-------|-------------|
| **Alive** | HTTP request through proxy to judge server or httpbin.org |
| **Anonymity** | Classifies as elite, anonymous, or transparent based on leaked headers |
| **Latency** | Round-trip time in milliseconds |
| **Google Pass** | Can the proxy reach `google.com/generate_204`? |
| **Hijack Detection** | Detects ad injection, redirects, captive portals, content substitution, SSL stripping |
| **Site Pass** | Tests reachability to Discord, TikTok, Instagram, X/Twitter, Reddit |
| **Geolocation** | Country + ASN via MaxMind GeoLite2 or free API fallback |

---

## Proxy Files

Updated automatically every hour.

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
| [`proxies/hijacked.json`](proxies/hijacked.json) | Full hijack details |
| [`proxies/malicious-asn.txt`](proxies/malicious-asn.txt) | ASNs ranked by hijacked count |

### Structured Data
| File | Description |
|------|-------------|
| [`data/proxies.json`](data/proxies.json) | Full proxy list with all metadata |
| [`data/stats.json`](data/stats.json) | Pool health snapshot with source quality |

---

## API

REST API on port 3000. Rate limited to 60 req/min per IP.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/proxies` | GET | Filtered proxy list. Params: `protocol`, `anonymity`, `google_pass`, `max_latency_ms`, `limit`, `offset`, `format` (json/txt) |
| `/proxies/random` | GET | Single random proxy. Same filters |
| `/stats` | GET | Pool health and protocol breakdown |
| `/refresh` | POST | Trigger pipeline run. Requires `X-Admin-Token`. 10-min timeout |
| `/optout` | POST | Exclude IP/CIDR from scanner. Body: `{"ip":"1.2.3.4"}` or `{"cidr":"1.2.3.0/24"}` |

---

## Pool Statistics

<!-- STATS_START -->
| Metric | Value |
| --- | --- |
| Total proxies | 25084 |
| Alive proxies | 951 |
| Elite proxies | 951 |
| Google pass | 366 |
| Hijacked | 4504 |
| Avg latency | 2882 ms |
| Last updated | 2026-04-06T12:11:33.000Z |
<!-- STATS_END -->

---

## Quick Start

```bash
npm install
npm run pipeline    # run the pipeline once
npm run dev         # start the API server
npm start           # pipeline + API
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
| `VALIDATOR_CONCURRENCY` | `100` | Parallel validation connections (CI uses 200) |
| `VALIDATOR_TIMEOUT_MS` | `5000` | Per-proxy timeout |
| `MAX_PER_SOURCE` | `5000` | Cap proxies per source to prevent memory issues |
| `BLACKLIST_WINDOW_SEC` | `10800` | Skip dead proxies checked within this window (3h) |
| `SKIP_GOOGLE_PASS` | `false` | Skip Google 204 check |
| `SKIP_SITE_PASS` | `false` | Skip Discord/TikTok/IG/X/Reddit checks |
| `JUDGE_URL` | `localhost:3001/judge` | Judge server for anonymity detection |
| `JUDGE_TOKEN` | `dev-token` | Judge server auth |
| `MAXMIND_LICENSE_KEY` | — | Enables offline geolocation |
| `SHODAN_API_KEY` | — | Enables Shodan source |
| `CENSYS_API_ID` / `SECRET` | — | Enables Censys source |
| `SCANNER_ENABLED` | `false` | Enable active port scanner |
| `TENDRIL_ENABLED` | `false` | Enable P2P distributed validation |
| `TENDRIL_REGION` | `XX` | ISO country code for this node |

---

## Tendril: Distributed Validation

Optional P2P layer. Nodes validate proxies from their own region via Hyperswarm DHT, producing geo-scoped availability data nobody else publishes.

```bash
TENDRIL_ENABLED=true TENDRIL_REGION=PH npm run pipeline
```

Auth headers blocked on public topic. Use private topics for authenticated scraping.

---

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22+ (TypeScript, ESM) |
| HTTP | Hono |
| Database | SQLite (better-sqlite3, WAL) |
| P2P | Hyperswarm + CRDTs |
| Geolocation | MaxMind GeoLite2 |
| CI/CD | GitHub Actions (hourly, cached) |

---

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

- Hijack detection (5 categories) blocks tampered proxies
- Rate limiting on all API endpoints
- Judge server token auth
- Opt-out system for IP operators
- Free proxies are untrusted — never route credentials through them

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).
