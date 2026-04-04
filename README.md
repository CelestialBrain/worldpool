# 🌐 Worldpool

<!-- BADGES_START -->
![Alive](https://img.shields.io/badge/alive-687-brightgreen)
![Google Pass](https://img.shields.io/badge/google--pass-140-blue)
![Hijacked Blocked](https://img.shields.io/badge/hijacked--blocked-1032-red)
![Avg Latency](https://img.shields.io/badge/avg--latency-5718ms-yellow)
![Reliability](https://img.shields.io/badge/reliability-10.5%25-purple)
![Updated](https://img.shields.io/badge/updated-2026--04--04-lightgrey)
<!-- BADGES_END -->

**Global proxy pool. Self-maintaining, free, open.**

Worldpool is an automated proxy aggregation, validation, and serving pipeline. It continuously scrapes free proxy sources across the internet, validates them for liveness, anonymity, latency, and Google-pass capability, then serves the curated pool via a REST API and flat-file exports.

---

## How It Works

```
[ Scrapers ]                    [ Shodan API (optional) ]
  ProxyScrape API                 port:1080, 8080, 3128
  Geonode API                   [ Censys API (optional) ]
  TheSpeedX GitHub                open proxy services
  Proxifly JSON                 [ Scanner (optional) ]
  Shodan API                      port-scans scan-targets.txt
  Censys API
  Scanner (active)
         ↓
[ Deduplicator ]
  normalize host:port
  discard duplicates
         ↓
[ Validator — p-limit ]
  → Self-hosted judge (echo headers → anonymity level)
  → Google generate_204 check
  → TCP latency measurement
  → Hijack detection (ad_injection, redirect, etc.)
         ↓
[ SQLite Store ]
  upsert by proxy_id (host:port)
  indexed on alive, anonymity, protocol, latency
         ↓
[ Exporter ]                    [ Hono REST API ]
  proxies/http.txt                GET /
  proxies/socks4.txt              GET /proxies
  proxies/socks5.txt              GET /proxies/random
  proxies/elite.txt               GET /stats
  proxies/google-pass.txt         POST /refresh
  proxies/hijacked.txt            POST /optout
  proxies/hijacked.json
  proxies/malicious-asn.txt
  data/proxies.json
  data/stats.json
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
| Total proxies | 6554 |
| Alive proxies | 687 |
| Elite proxies | 687 |
| Google pass | 140 |
| Hijacked | 1032 |
| Avg latency | 5718 ms |
| Last updated | 2026-04-04T01:20:10.000Z |
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
| Geolocation | MaxMind GeoLite2-Country + GeoLite2-ASN (offline, zero-latency) |
| Proxy Discovery | Shodan API (optional, `SHODAN_API_KEY`) |
| Proxy Discovery | Censys API (optional, `CENSYS_API_ID` + `CENSYS_API_SECRET`) |
| Proxy Discovery | Active Scanner (optional, `SCANNER_ENABLED=true`) |
| Scheduling | GitHub Actions cron / node-cron |
| CI/CD | GitHub Actions |

---

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
