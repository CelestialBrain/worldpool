# 🌐 Worldpool

**Global proxy pool. Self-maintaining, free, open.**

Worldpool is an automated proxy aggregation, validation, and serving pipeline. It continuously scrapes free proxy sources across the internet, validates them for liveness, anonymity, latency, and Google-pass capability, then serves the curated pool via a REST API and flat-file exports.

---

## How It Works

```
[ Scrapers ]                    [ Shodan API (optional) ]
  ProxyScrape API                 port:1080, 8080, 3128
  Geonode API
  TheSpeedX GitHub
  Proxifly JSON
         ↓
[ Deduplicator ]
  normalize host:port
  discard duplicates
         ↓
[ Validator — worker_threads + p-limit ]
  → Self-hosted judge (echo headers → anonymity level)
  → Google generate_204 check
  → TCP latency measurement
         ↓
[ SQLite Store ]
  upsert by proxy_id (host:port)
  indexed on alive, anonymity, protocol, latency
         ↓
[ Exporter ]                    [ Hono REST API ]
  proxies/http.txt                GET /proxies
  proxies/socks4.txt              GET /proxies/random
  proxies/socks5.txt              GET /stats
  proxies/elite.txt               POST /refresh
  proxies/google-pass.txt
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

### Structured Data

| File | Description |
|------|-------------|
| [`data/proxies.json`](data/proxies.json) | Full proxy list with metadata (protocol, anonymity, latency, country) |
| [`data/stats.json`](data/stats.json) | Pool health snapshot (counts, avg latency, breakdown by protocol) |

---

## API

The REST API serves the live pool. Default port: `3000`.

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

---

## Pool Statistics

<!-- STATS_START -->
_No data yet — run the pipeline to populate._
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

---

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (TypeScript) |
| HTTP Framework | Hono |
| Database | SQLite (better-sqlite3) |
| Proxy Agents | proxy-agent (auto-detect protocol) |
| Concurrency | p-limit + worker_threads |
| Scheduling | GitHub Actions cron / node-cron |
| CI/CD | GitHub Actions |

---

## Security

- **Judge server** requires `X-Judge-Token` header — only responds to validated requests
- **Validator runs on isolated infra** — never share with production apps
- **Concurrency hard-capped** at 100 to prevent OOM on constrained nodes
- **All proxy responses** are try/catch guarded — malicious payloads can't crash the validator
- **Free proxies are untrusted** — never route authenticated requests through them

---

## License

MIT
