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

Worldpool scrapes free proxy sources, validates every proxy for liveness, anonymity, latency, hijack detection, and Google-pass capability, then exports curated lists and serves them via a REST API. The pipeline runs hourly on GitHub Actions.

---

## Pipeline

```
SCRAPE ─── 12 sources in parallel
  │
DEDUP ──── normalize host:port, first-seen wins
  │
VALIDATE ─ alive check, anonymity, latency, google 204, hijack detection (5 types)
  │
  ├── [optional] TENDRIL ── P2P swarm validates from multiple regions worldwide
  │
STORE ──── SQLite upsert by host:port, track reliability over time
  │
EXPORT ─── flat text files, structured JSON, stats, README badges
```

### Sources

| Source | Type | Protocols | Notes |
|--------|------|-----------|-------|
| ProxyScrape | REST API | HTTP, SOCKS4, SOCKS5 | Filterable by protocol/timeout/country |
| Geonode | REST API | HTTP, SOCKS4, SOCKS5 | Has built-in google_pass flag |
| TheSpeedX | GitHub raw | HTTP, SOCKS4, SOCKS5 | High volume, hourly updates |
| Proxifly | GitHub raw | HTTP, SOCKS4, SOCKS5 | Structured JSON with metadata |
| Monosans | GitHub raw | HTTP, SOCKS4, SOCKS5 | Updated hourly, per-protocol files |
| Clarketm | GitHub raw | HTTP | Curated list |
| Hookzof | GitHub raw | SOCKS5 | SOCKS5-focused |
| Fate0 | GitHub raw | HTTP, SOCKS4, SOCKS5 | JSONL with country metadata |
| Sunny9577 | GitHub raw | HTTP, SOCKS4, SOCKS5 | Per-protocol files |
| Shodan | REST API | HTTP, SOCKS4, SOCKS5 | Searches open proxy ports. Requires `SHODAN_API_KEY` |
| Censys | REST API | HTTP, SOCKS5 | Searches open proxy services. Requires `CENSYS_API_ID` + `CENSYS_API_SECRET` |
| Scanner | Active probe | HTTP, SOCKS4, SOCKS5 | Port-scans IP ranges from `data/scan-targets.txt`. Disabled by default |

### Validation Checks

| Check | Method |
|-------|--------|
| Alive | HTTP GET through proxy to judge server (fallback: httpbin.org) |
| Anonymity | Parse echoed headers: elite, anonymous, transparent |
| Google Pass | `GET https://www.google.com/generate_204` through proxy |
| Latency | Round-trip time in milliseconds |
| Hijack Detection | 5 categories: ad injection, redirect, captive portal, content substitution, SSL strip |
| Geolocation | MaxMind GeoLite2 (offline) or free API fallback |

---

## Proxy Files

Updated automatically every hour via GitHub Actions.

| File | Description |
|------|-------------|
| [`proxies/http.txt`](proxies/http.txt) | HTTP proxies, `host:port` per line |
| [`proxies/socks4.txt`](proxies/socks4.txt) | SOCKS4 proxies |
| [`proxies/socks5.txt`](proxies/socks5.txt) | SOCKS5 proxies |
| [`proxies/all.txt`](proxies/all.txt) | All alive proxies |
| [`proxies/elite.txt`](proxies/elite.txt) | Elite anonymity only |
| [`proxies/google-pass.txt`](proxies/google-pass.txt) | Proxies passing Google's `generate_204` check |
| [`proxies/by-speed/turbo.txt`](proxies/by-speed/turbo.txt) | < 200ms |
| [`proxies/by-speed/fast.txt`](proxies/by-speed/fast.txt) | 200-500ms |
| [`proxies/by-speed/medium.txt`](proxies/by-speed/medium.txt) | 500-2000ms |
| [`proxies/by-speed/slow.txt`](proxies/by-speed/slow.txt) | > 2000ms |
| [`proxies/by-anonymity/elite.txt`](proxies/by-anonymity/elite.txt) | Elite anonymity |
| [`proxies/by-anonymity/anonymous.txt`](proxies/by-anonymity/anonymous.txt) | Anonymous (non-elite) |

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

REST API on port 3000.

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

Trigger a full pipeline run. Requires `X-Admin-Token` header.

### `POST /optout`

Exclude an IP or CIDR from the active scanner.

```json
{ "ip": "1.2.3.4" }
{ "cidr": "1.2.3.0/24" }
```

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

```typescript
import { Tendril } from 'worldpool-tendril';

const t = new Tendril({ topic: 'worldpool' });
await t.connect();

const page = await t.get('https://example.com');
const proxy = await t.getProxy({ protocol: 'socks5' });
const results = await t.batch([
  { url: 'https://httpbin.org/ip' },
  { url: 'https://httpbin.org/headers' },
]);

await t.disconnect();
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
- Threat-intel exports for downstream consumption
- Opt-out system for IP operators (`POST /optout`)
- Concurrency hard-capped to prevent OOM
- All proxy responses are try/catch guarded
- Free proxies are untrusted — never route authenticated requests through them

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).
