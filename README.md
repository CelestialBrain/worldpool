# Worldpool

<!-- BADGES_START -->
![Alive](https://img.shields.io/badge/alive-621-brightgreen)
![Google Pass](https://img.shields.io/badge/google--pass-118-blue)
![Hijacked Blocked](https://img.shields.io/badge/hijacked--blocked-957-red)
![Avg Latency](https://img.shields.io/badge/avg--latency-21745ms-yellow)
![Reliability](https://img.shields.io/badge/reliability-8.5%25-purple)
![Updated](https://img.shields.io/badge/updated-2026--04--04-lightgrey)
<!-- BADGES_END -->

**Global proxy pool. Self-maintaining, free, open.**

Worldpool aggregates proxies from 34 sources, validates every one for liveness, anonymity, latency, hijack detection, and site-specific pass checks (Google, Discord, TikTok, Instagram, X, Reddit), then exports curated lists and serves them via a REST API. The pipeline runs hourly on GitHub Actions.

---

## Pipeline

```
SCRAPE ─── 34 sources in parallel (~100k+ raw)
  │
DEDUP ──── normalize host:port, first-seen wins
  │
VALIDATE ─ alive, anonymity, latency, google 204, hijack detection (5 types)
  │
  ├── SITE PASS ── test each alive proxy against Discord, TikTok, Instagram, X, Reddit
  │
  ├── [optional] TENDRIL ── P2P swarm validates from multiple regions worldwide
  │
STORE ──── SQLite upsert by host:port, track reliability over time
  │
EXPORT ─── flat text files, structured JSON, per-site exports, stats, README badges
```

### Sources (34)

#### APIs
| Source | Protocols | Notes |
|--------|-----------|-------|
| ProxyScrape | HTTP, SOCKS4, SOCKS5 | Filterable by protocol/timeout/country |
| Geonode | HTTP, SOCKS4, SOCKS5 | Built-in google_pass flag |
| Databay | HTTP, SOCKS4, SOCKS5 | Free API, ~7.5k, no auth |
| Shodan | HTTP, SOCKS4, SOCKS5 | Requires `SHODAN_API_KEY` |
| Censys | HTTP, SOCKS5 | Requires `CENSYS_API_ID` + `CENSYS_API_SECRET` |

#### GitHub Repos (raw text)
| Source | Est. Proxies | Update Freq |
|--------|-------------|-------------|
| ErcinDedeoglu/proxies | ~39k | Hourly |
| fyvri/fresh-proxy-list | ~8-15k | Hourly |
| vmheaven/VMHeaven | ~9-15k | Every 15 min |
| MuRongPIG/Proxy-Master | ~8k+ | Frequent |
| iplocate/free-proxy-list | ~8k+ | Every 30 min |
| TheSpeedX/PROXY-List | ~7k | Hourly |
| r00tee/Proxy-List | ~5k+ | Every 5 min |
| casa-ls/proxy-list | ~5k+ | Every 5 min |
| ProxyScraper/ProxyScraper | ~5k+ | Every 30 min |
| zevtyardt/proxy-list | ~8-10k | Daily |
| dinoz0rg/proxy-list | ~10k+ | Every 2 hours |
| Proxifly | ~3k | Every 5 min |
| jetkai/proxy-list | ~3k+ | Hourly |
| Sunny9577 | ~1.8k | Frequent |
| Vann-Dev/proxy-list | ~1.5k | Checked to Google/Discord/TikTok |
| mmpx12/proxy-list | ~1k | Hourly |
| vakhov/fresh-proxy-list | ~900 | Every 5-20 min |
| ClearProxy/checked-proxy-list | ~800 | Every 5 min |
| Monosans | ~500 | Hourly |
| Clarketm | ~400 | Curated |
| Fate0 | ~250 | JSONL with country metadata |
| prxchk/proxy-list | ~100+ | Every 10 min |
| Hookzof | ~100 | SOCKS5-focused |
| roosterkid/openproxylist | ~60-200 | Hourly |
| zloi-user/hideip.me | Varies | Every 10 min, includes country |
| Spys.me | ~400 | Custom format with anonymity data |

#### HTML Scraping
| Source | Protocols | Notes |
|--------|-----------|-------|
| free-proxy-list.net | HTTP | Updated every 10 min |
| sslproxies.org | HTTPS | Same operator |
| us-proxy.org | HTTP | US proxies focus |
| socks-proxy.net | SOCKS4, SOCKS5 | Same operator |

#### Active Probing
| Source | Notes |
|--------|-------|
| Scanner | Port-scans IP ranges. Disabled by default (`SCANNER_ENABLED=true`) |

### Validation Checks

| Check | Method |
|-------|--------|
| Alive | HTTP GET through proxy to judge server (fallback: httpbin.org) |
| Anonymity | Parse echoed headers: elite, anonymous, transparent |
| Google Pass | `GET https://www.google.com/generate_204` |
| Latency | Round-trip time in milliseconds |
| Hijack Detection | 5 categories: ad injection, redirect, captive portal, content substitution, SSL strip |
| Geolocation | MaxMind GeoLite2 (offline) or free API fallback |
| Site Pass | Discord, TikTok, Instagram, X, Reddit — lightweight endpoint checks |

---

## Proxy Files

Updated automatically every hour via GitHub Actions.

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
| [`proxies/elite.txt`](proxies/elite.txt) | Elite anonymity only |
| [`proxies/google-pass.txt`](proxies/google-pass.txt) | Passes Google's `generate_204` |
| [`proxies/by-anonymity/elite.txt`](proxies/by-anonymity/elite.txt) | Elite anonymity |
| [`proxies/by-anonymity/anonymous.txt`](proxies/by-anonymity/anonymous.txt) | Anonymous (non-elite) |

### By Speed
| File | Description |
|------|-------------|
| [`proxies/by-speed/turbo.txt`](proxies/by-speed/turbo.txt) | < 200ms |
| [`proxies/by-speed/fast.txt`](proxies/by-speed/fast.txt) | 200-500ms |
| [`proxies/by-speed/medium.txt`](proxies/by-speed/medium.txt) | 500-2000ms |
| [`proxies/by-speed/slow.txt`](proxies/by-speed/slow.txt) | > 2000ms |

### By Site (which platforms this proxy can reach)
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
| [`proxies/malicious-asn.txt`](proxies/malicious-asn.txt) | ASNs ranked by hijacked proxy count |

### Structured Data
| File | Description |
|------|-------------|
| [`data/proxies.json`](data/proxies.json) | Full proxy list with metadata |
| [`data/stats.json`](data/stats.json) | Pool health snapshot |

---

## API

REST API on port 3000. Rate limited to 60 requests/min per IP.

### `GET /proxies`

Returns filtered proxies sorted by latency.

| Param | Type | Description |
|-------|------|-------------|
| `protocol` | `http\|socks4\|socks5` | Filter by protocol |
| `anonymity` | `elite\|anonymous\|transparent` | Filter by anonymity |
| `google_pass` | `true` | Only Google-pass proxies |
| `max_latency_ms` | `number` | Maximum latency |
| `limit` | `number` | Max results (default 100, max 1000) |
| `offset` | `number` | Pagination offset |
| `format` | `json\|txt` | Response format (default json) |

### `GET /proxies/random`

Single random proxy. Same filters as `/proxies`.

### `GET /stats`

Pool health and protocol breakdown.

### `POST /refresh`

Trigger a full pipeline run. Requires `X-Admin-Token` header. 10-minute timeout, rejects concurrent runs.

### `POST /optout`

Exclude an IP or CIDR from the active scanner.

---

## Pool Statistics

<!-- STATS_START -->
| Metric | Value |
| --- | --- |
| Total proxies | 7273 |
| Alive proxies | 621 |
| Elite proxies | 569 |
| Google pass | 118 |
| Hijacked | 957 |
| Avg latency | 21745 ms |
| Last updated | 2026-04-04T17:41:40.000Z |
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
# Test 10 random Google-pass proxies
npx tsx src/test-proxies.ts 10 proxies/google-pass.txt

# Test 5 elite proxies
npx tsx src/test-proxies.ts 5 proxies/elite.txt

# Test Discord-passing proxies
npx tsx src/test-proxies.ts 10 proxies/by-site/discord.txt
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JUDGE_URL` | No | Judge server URL (default: localhost) |
| `JUDGE_TOKEN` | No | Judge server auth token |
| `MAXMIND_LICENSE_KEY` | No | Enables offline geolocation |
| `MAXMIND_ACCOUNT_ID` | No | MaxMind account ID |
| `SHODAN_API_KEY` | No | Enables Shodan proxy discovery |
| `CENSYS_API_ID` | No | Enables Censys proxy discovery |
| `CENSYS_API_SECRET` | No | Censys API secret |
| `SCANNER_ENABLED` | No | Set `true` to enable active scanner |
| `TENDRIL_ENABLED` | No | Set `true` to enable P2P distributed validation |
| `TENDRIL_REGION` | No | ISO country code for this node (e.g. `PH`) |

---

## Tendril: Distributed Validation

Optional P2P layer. When enabled, nodes around the world validate proxies from their own region, producing geo-scoped availability data.

```bash
TENDRIL_ENABLED=true TENDRIL_REGION=PH npm run pipeline
```

Auth headers are blocked on the public `worldpool` topic to prevent credential leakage. Use a private topic for authenticated scraping.

---

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22+ (TypeScript, ESM) |
| HTTP Framework | Hono |
| Database | SQLite (better-sqlite3, WAL mode) |
| Proxy Agents | proxy-agent, socks-proxy-agent |
| P2P Networking | Hyperswarm (DHT + NAT traversal) |
| Distributed State | CRDTs (PN-Counters, Vector Clocks) |
| Geolocation | MaxMind GeoLite2 |
| Validation | Zod v4 |
| CI/CD | GitHub Actions (hourly) |

---

## Security

- Judge server requires `X-Judge-Token` auth
- Hijack detection flags and blocks tampered proxies (5 detection categories)
- Site-pass checks verify reachability to popular platforms
- Threat-intel exports for downstream consumption
- Rate limiting on all API endpoints (60 req/min per IP)
- Opt-out system for IP operators (`POST /optout`)
- Concurrency hard-capped to prevent OOM
- All proxy responses are try/catch guarded
- Free proxies are untrusted — never route authenticated requests through them

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).
