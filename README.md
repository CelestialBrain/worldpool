# 🌐 Worldpool

<!-- BADGES_START -->
![Alive](https://img.shields.io/badge/alive-630-brightgreen)
![Google Pass](https://img.shields.io/badge/google--pass-149-blue)
![Hijacked Blocked](https://img.shields.io/badge/hijacked--blocked-898-red)
![Avg Latency](https://img.shields.io/badge/avg--latency-5965ms-yellow)
![Reliability](https://img.shields.io/badge/reliability-10.4%25-purple)
![Updated](https://img.shields.io/badge/updated-2026--04--04-lightgrey)
<!-- BADGES_END -->

**Global proxy pool. Self-maintaining, free, open.**

Worldpool is an automated proxy aggregation, validation, and serving pipeline. It continuously scrapes free proxy sources across the internet, validates them for liveness, anonymity, latency, and Google-pass capability, then serves the curated pool via a REST API and flat-file exports.

---

## How It Works

```
                        ┌──────────────────────────┐
                        │       7 SCRAPERS          │
                        │                          │
                        │  ProxyScrape · Geonode   │
                        │  TheSpeedX  · Proxifly   │
                        │  Shodan  · Censys · Scan │
                        └────────────┬─────────────┘
                                     │
                                     ▼
                        ┌──────────────────────────┐
                        │      DEDUPLICATE         │
                        │   normalize host:port    │
                        └────────────┬─────────────┘
                                     │
                                     ▼
                        ┌──────────────────────────┐
                        │       VALIDATE           │
                        │                          │
                        │  ✓ Alive (judge server)  │
                        │  ✓ Anonymity level       │
                        │  ✓ Google 204 pass       │
                        │  ✓ Latency (ms)          │
                        │  ✓ Hijack detection      │
                        └────────────┬─────────────┘
                                     │
                            TENDRIL_ENABLED?
                           ╱                ╲
                         yes                 no
                          │                   │
                          ▼                   │
               ┌─────────────────────┐        │
               │  TENDRIL DISTRIBUTE │        │
               │                     │        │
               │  P2P swarm validates│        │
               │  from multiple      │        │
               │  regions worldwide  │        │
               └──────────┬──────────┘        │
                          │                   │
                          └─────────┬─────────┘
                                    │
                                    ▼
                        ┌──────────────────────────┐
                        │     SQLITE STORE         │
                        │  upsert by host:port     │
                        └────────────┬─────────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
               ┌────────────────────┐  ┌──────────────────┐
               │   FILE EXPORT      │  │   REST API       │
               │                    │  │                  │
               │  proxies/http.txt  │  │  GET /proxies    │
               │  proxies/socks4.txt│  │  GET /random     │
               │  proxies/socks5.txt│  │  GET /stats      │
               │  proxies/elite.txt │  │  POST /refresh   │
               │  data/proxies.json │  │  POST /optout    │
               │  data/stats.json   │  │                  │
               └────────────────────┘  └──────────────────┘
```

---

## Proxy Files

Updated automatically every 6 hours via GitHub Actions.

| File | Description |
|------|-------------|
| [`proxies/http.txt`](proxies/http.txt) | HTTP proxies, `host:port` per line |
| [`proxies/socks4.txt`](proxies/socks4.txt) | SOCKS4 proxies |
| [`proxies/socks5.txt`](proxies/socks5.txt) | SOCKS5 proxies |
| [`proxies/elite.txt`](proxies/elite.txt) | Elite anonymity only (all protocols) |
| [`proxies/google-pass.txt`](proxies/google-pass.txt) | Proxies that pass Google's `generate_204` check |
| [`proxies/hijacked.txt`](proxies/hijacked.txt) | Hijacked proxy IPs, `host:port` per line |
| [`proxies/hijacked.json`](proxies/hijacked.json) | Full hijacked proxy details with classification |
| [`proxies/malicious-asn.txt`](proxies/malicious-asn.txt) | ASNs ranked by hijacked proxy count |
| [`proxies/by-anonymity/elite.txt`](proxies/by-anonymity/elite.txt) | Elite anonymity proxies |
| [`proxies/by-anonymity/anonymous.txt`](proxies/by-anonymity/anonymous.txt) | Anonymous (non-elite) proxies |
| [`proxies/by-speed/turbo.txt`](proxies/by-speed/turbo.txt) | Ultra-fast proxies (&lt;200ms) |
| [`proxies/by-speed/fast.txt`](proxies/by-speed/fast.txt) | Fast proxies (200–500ms) |
| [`proxies/by-speed/medium.txt`](proxies/by-speed/medium.txt) | Medium latency (500–2000ms) |
| [`proxies/by-speed/slow.txt`](proxies/by-speed/slow.txt) | Slow proxies (&gt;2000ms) |

### Structured Data

| File | Description |
|------|-------------|
| [`data/proxies.json`](data/proxies.json) | Full proxy list with metadata (protocol, anonymity, latency, country) |
| [`data/stats.json`](data/stats.json) | Pool health snapshot (counts, avg latency, breakdown by protocol, source quality) |
| [`data/scan-targets.txt`](data/scan-targets.txt) | IP ranges for the active scanner |
| [`data/scan-exclude.txt`](data/scan-exclude.txt) | IPs/CIDRs excluded from scanning (opt-out list) |
| [`CHANGELOG.md`](CHANGELOG.md) | Auto-appended run history (alive delta, hijacked, google pass, latency) |

---

## API

The REST API serves the live pool. Default port: `3000`.

### `GET /`

Health check.

```json
{ "name": "worldpool", "status": "ok" }
```

### `GET /proxies`

Returns filtered proxies sorted by latency.

| Param | Type | Description |
|-------|------|-------------|
| `protocol` | `http\|socks4\|socks5` | Filter by protocol |
| `anonymity` | `elite\|anonymous\|transparent` | Filter by anonymity level |
| `google_pass` | `true` | Only proxies passing Google check |
| `max_latency_ms` | `number` | Maximum acceptable latency |
| `limit` | `number` | Max results (default 100, max 1000) |
| `offset` | `number` | Pagination offset |
| `format` | `json\|txt` | Response format (default json) |

```json
{
  "proxy": [
    {
      "id": "203.0.113.1:8080",
      "host": "203.0.113.1",
      "port": 8080,
      "protocol": "http",
      "anonymity": "elite",
      "latency_ms": 142,
      "google_pass": true,
      "hijacked": false,
      "country": "PH",
      "last_checked": 1743696000
    }
  ],
  "proxy_count": 1
}
```

### `GET /proxies/random`

Returns a single random proxy from the live pool. Accepts same filters as `/proxies`.

```json
{
  "proxy": { ... }
}
```

### `GET /stats`

Pool health and breakdown.

```json
{
  "proxy_count": 3245,
  "alive_count": 812,
  "elite_count": 445,
  "google_pass_count": 89,
  "hijacked_count": 134,
  "avg_latency_ms": 340,
  "by_protocol": [
    { "protocol": "http", "proxy_count": 502 },
    { "protocol": "socks4", "proxy_count": 198 },
    { "protocol": "socks5", "proxy_count": 112 }
  ]
}
```

### `POST /refresh`

Manually trigger a full pipeline run. Requires `X-Admin-Token` header.

```json
{ "ok": true, "alive_count": 812 }
```

### `POST /optout`

Request exclusion of an IP or CIDR range from the active scanner. Appends the entry to `data/scan-exclude.txt`.

**Body (JSON):**

```json
{ "ip": "1.2.3.4" }
```

or

```json
{ "cidr": "1.2.3.0/24" }
```

**Response:**

```json
{ "ok": true, "added": "1.2.3.4" }
```

---

## Pool Statistics

<!-- STATS_START -->
| Metric | Value |
| --- | --- |
| Total proxies | 6030 |
| Alive proxies | 630 |
| Elite proxies | 630 |
| Google pass | 149 |
| Hijacked | 898 |
| Avg latency | 5965 ms |
| Last updated | 2026-04-04T07:01:26.000Z |
<!-- STATS_END -->

---

## Quick Start

```bash
# Install dependencies
npm install

# Run the pipeline once
npm run pipeline

# Start the API server
npm run dev

# Or run both (pipeline + API)
npm start
```

### MaxMind GeoLite2 (optional)

For offline IP geolocation, download the free GeoLite2-Country database:

1. Sign up at [maxmind.com](https://www.maxmind.com/en/geolite2/signup) for a free account
2. Generate a license key and add it as the `MAXMIND_LICENSE_KEY` secret in your repo settings
3. The GitHub Actions pipeline will automatically download and use the database

Without the database, the pipeline runs normally — proxies will use country data from the scrapers where available.

---

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (TypeScript) |
| HTTP Framework | Hono |
| Database | SQLite (better-sqlite3) |
| Proxy Agents | proxy-agent (auto-detect protocol) |
| Concurrency | p-limit |
| P2P Networking | Hyperswarm (DHT + NAT traversal) |
| Distributed State | CRDTs (PN-Counters, Vector Clocks) |
| Message Encoding | MsgPack |
| Validation | Zod v4 |
| Geolocation | MaxMind GeoLite2-Country + GeoLite2-ASN (offline, zero-latency) |
| Proxy Discovery | Shodan API, Censys API, Active Scanner |
| Scheduling | GitHub Actions cron / node-cron |
| CI/CD | GitHub Actions |

---

## Tendril: Distributed Scraping SDK

Worldpool includes an optional P2P distributed scraping layer. When enabled, nodes around the world validate proxies from their own region — giving you geo-scoped availability data nobody else publishes.

### SDK Usage

```typescript
import { Tendril } from 'worldpool-tendril';

const t = new Tendril({ topic: 'worldpool' });
await t.connect();

// Scrape through the distributed network
const page = await t.get('https://example.com');
console.log(page.status, page.body, page.nodeId);

// Get a random proxy from Worldpool's pool
const proxy = await t.getProxy({ protocol: 'socks5' });

// Batch requests across the swarm
const results = await t.batch([
  { url: 'https://httpbin.org/ip' },
  { url: 'https://httpbin.org/headers' },
]);

await t.disconnect();
```

### Private Topics (Authenticated Scraping)

```typescript
const t = new Tendril({ topic: 'my-secret-topic' });
await t.connect();
// Auth headers ALLOWED on private topics
const data = await t.get('https://api.example.com/data', {
  headers: { 'Authorization': 'Bearer sk-xxx' },
});
```

> Auth headers on the public `worldpool` topic are blocked to prevent credential leakage.

### Running a Node

```bash
TENDRIL_ENABLED=true TENDRIL_REGION=PH npm run pipeline
```




## Security

- **Judge server** requires `X-Judge-Token` header — only responds to validated requests
- **Hijack detection** — each live proxy is probed against a known endpoint; if the response is tampered, the proxy is flagged `hijacked = true` and never served. Five detection categories: `ad_injection`, `redirect`, `captive_portal`, `content_substitution`, `ssl_strip`
- **Threat-intel exports** — hijacked proxies are written to `proxies/hijacked.txt`, `proxies/hijacked.json`, and `proxies/malicious-asn.txt` for downstream consumption
- **Opt-out system** — IP operators can request exclusion from the active scanner via `POST /optout`; exclusions are stored in `data/scan-exclude.txt` and respected on every scan run
- **Validator runs on isolated infra** — never share with production apps
- **Concurrency hard-capped** at 100 to prevent OOM on constrained nodes
- **All proxy responses** are try/catch guarded — malicious payloads can't crash the validator
- **Free proxies are untrusted** — never route authenticated requests through them

---

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
