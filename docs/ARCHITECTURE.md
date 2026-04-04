# Architecture

Technical deep-dive into Worldpool's pipeline, validation strategy, and deployment model.

## Pipeline Overview

Worldpool runs a 5-stage pipeline every hour via GitHub Actions.

```
SCRAPE ──▶ DEDUP ──▶ VALIDATE ──▶ STORE ──▶ EXPORT
12 sources   host:port   judge/httpbin   SQLite    txt/json
in parallel  normalize   google 204      upsert    stats
                         latency                   README
                         hijack detect
```

## Stage 1: Scrape

Each source has its own fetcher in `src/scrapers/`. All run in parallel via `Promise.allSettled()` — one source failing doesn't block the others.

### Sources

| Source | Type | Format | Notes |
|--------|------|--------|-------|
| **ProxyScrape** | REST API | Raw text | Filterable by protocol, timeout, country |
| **Geonode** | REST API | JSON | Has built-in `google_pass` flag |
| **TheSpeedX** | GitHub raw | Text files | Separate files per protocol, high volume |
| **Proxifly** | GitHub raw | JSON | Structured with country metadata |
| **Monosans** | GitHub raw | Text files | Updated hourly, per-protocol files |
| **Clarketm** | GitHub raw | Text file | HTTP-only curated list |
| **Hookzof** | GitHub raw | Text file | SOCKS5-focused |
| **Fate0** | GitHub raw | JSONL | One JSON object per line with host, port, type, country |
| **Sunny9577** | GitHub raw | Text files | Per-protocol files |
| **Shodan** | REST API | JSON | Searches for open proxy ports (1080, 3128, 8080). Requires `SHODAN_API_KEY`. |
| **Censys** | REST API | JSON | Searches for open proxy services. Requires `CENSYS_API_ID` + `CENSYS_API_SECRET`. |
| **Scanner** | Active probe | Raw | Port-scans IP ranges from `data/scan-targets.txt`, respects `data/scan-exclude.txt`. Disabled by default (`SCANNER_ENABLED=true`). |

### Fetcher Contract

Every scraper module exports:

```typescript
export async function scrape(): Promise<RawProxy[]>
```

Where `RawProxy` is:

```typescript
interface RawProxy {
  host: string;
  port: number;
  protocol: ProxyProtocol;
  country?: string;
  source?: string;
}
```

## Stage 2: Deduplicate

After all sources return, proxies are merged and deduplicated:

1. Normalize host to lowercase, trim whitespace
2. Generate key as `{host}:{port}`
3. First-seen wins (preserves richer metadata from structured sources like Geonode)

## Stage 3: Validate

The most resource-intensive stage. Uses `p-limit` to cap concurrent outbound connections.

### Checks Performed

| Check | Method | Pass Condition |
|-------|--------|---------------|
| **Alive** | HTTP GET through proxy to judge server | HTTP 200 within timeout |
| **Anonymity** | Parse returned headers from judge | See classification below |
| **Google Pass** | GET `https://www.google.com/generate_204` through proxy | HTTP 204 response |
| **Latency** | `Date.now()` delta around the alive check | Recorded in milliseconds |
| **Hijack Detection** | Probe against known endpoint, classify tampering | 5 categories (see below) |
| **Geolocation** | MaxMind GeoLite2 offline lookup or free API fallback | Country + ASN |

### Anonymity Classification

The validator sends a request through the proxy to a judge server that echoes back all request headers.

| Level | Condition |
|-------|-----------|
| **elite** | Real IP not in headers, no `Via`/`X-Forwarded-For`/`Proxy-Connection` |
| **anonymous** | Real IP not in headers, but proxy-identifying headers present |
| **transparent** | Real IP appears in `X-Forwarded-For` or similar |
| **unknown** | Validation failed or inconclusive |

### Hijack Detection

Each live proxy is probed against `httpbin.org/get`. Tampered responses are classified:

| Category | Description |
|----------|-------------|
| `ad_injection` | Proxy injects advertising scripts/content |
| `redirect` | Proxy redirects to a different destination |
| `captive_portal` | Proxy presents a login/portal page |
| `content_substitution` | Proxy modifies response body |
| `ssl_strip` | Proxy strips TLS from HTTPS connections |

Flagged proxies are permanently excluded from the served pool and exported to threat-intel files.

### Judge Server

Self-hosted, minimal — a Hono endpoint that echoes headers with token auth:

```typescript
app.get('/judge', (c) => {
  const token = c.req.header('X-Judge-Token');
  if (token !== config.judgeToken) return c.text('Forbidden', 403);
  return c.json(Object.fromEntries(c.req.raw.headers));
});
```

Must be deployed on a known IP so the validator can detect whether that IP leaks through the proxy.

### Concurrency Model

```
Main thread
  └── p-limit(100) ← configurable via VALIDATOR_CONCURRENCY, hard max 200
        ├── validateProxy(proxy1) → axios through ProxyAgent
        ├── validateProxy(proxy2) → axios through ProxyAgent
        └── ... (up to 100 concurrent)
```

## Stage 4: Store

SQLite with WAL mode. Single `proxy` table, upserted by `proxy_id` (natural key = `host:port`).

### Upsert Strategy

- New proxies get inserted
- Known proxies get their validation results updated
- Dead proxies stay in the DB with `alive = 0` (historical record)
- `reliability_pct` = `alive_count / check_count * 100` — tracked over time

See `migrations/001_init.sql` for full schema.

## Stage 5: Export

After storage, the exporter generates:

1. **Flat text files** in `proxies/` — one `host:port` per line, split by protocol, speed tier, and anonymity
2. **Threat-intel files** — hijacked proxy records (`hijacked.txt`, `hijacked.json`, `malicious-asn.txt`)
3. **JSON exports** in `data/` — full structured data + stats snapshot
4. **README update** — replaces the stats section between marker comments
5. **CHANGELOG append** — logs deltas (alive count, hijacked, google pass, latency)

## Deployment

### GitHub Actions (Primary)

```yaml
schedule:
  - cron: '0 * * * *'  # every hour
```

The workflow:
1. Checks out the repo
2. Installs dependencies
3. Downloads GeoLite2 databases (when `MAXMIND_LICENSE_KEY` is set)
4. Runs `npm run pipeline`
5. Commits changed files back to the repo

Every run uses a fresh Azure runner IP — good for avoiding rate limits on proxy sources.

### Local / VPS (Optional)

For real-time API access:
1. Run `npm start` — starts Hono server + background cron
2. Pipeline runs on schedule, API serves latest results from SQLite
3. Judge endpoint self-hosted on the same server

**Rule:** Never run the validator on the same VPS as production apps. Treat validator nodes as throwaway.

## Opt-out System

IP operators can request exclusion from the active scanner via `POST /optout`. Exclusions are appended to `data/scan-exclude.txt` and respected on every scan run. The file is committed back to the repo by GitHub Actions, so exclusions persist across runs.

## Tendril: Distributed Validation

Optional P2P layer (enable with `TENDRIL_ENABLED=true`). Distributes proxy validation jobs across volunteer nodes via Hyperswarm.

### Architecture

```
SDK Layer (worldpool-tendril)
  t.get() / t.post() / t.batch() / t.getProxy()
    │
Node Layer (TendrilNode)
  Orchestrates: swarm, handler, executor, conflict resolution
    │
P2P Layer (Hyperswarm)
  DHT discovery, NAT traversal, MsgPack messages
    │
Data Layer (SQLite)
  job, tendril_node, regional_validation, scrap_transaction
```

### Flow

1. Pipeline posts validation jobs after local validation
2. Jobs propagate via Hyperswarm DHT to all connected nodes
3. Each peer executes from their own IP/region, recording alive/latency/google_pass
4. Results stored in `regional_validation` table — per-region availability data

### Conflict Resolution

- **Vector Clocks** — track causality for job updates. Concurrent edits resolved deterministically.
- **PN-Counters** — track job completion counts across nodes without coordination.

### Security: Public vs Private Topics

| Topic | Who Can Join | Auth Headers | Use Case |
|-------|-------------|-------------|----------|
| Public (`worldpool`) | Anyone | Blocked | Anonymous proxy validation |
| Private (user-defined) | Nodes you control | Allowed | Authenticated scraping |

### Regional Validation

The killer feature — geo-scoped data nobody else publishes:

```sql
proxy_id │ region │ alive │ latency_ms │ google_pass
─────────┼────────┼───────┼────────────┼────────────
1.2.3.4  │ PH     │ 1     │ 45         │ 1
1.2.3.4  │ DE     │ 0     │ -1         │ 0
1.2.3.4  │ US     │ 1     │ 220        │ 1
```

## Threat Model

See [SECURITY.md](SECURITY.md) for the full threat analysis and mitigations.
