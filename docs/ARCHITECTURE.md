# Architecture

Technical deep-dive into Worldpool's pipeline, validation strategy, and deployment model.

## Pipeline Overview

Worldpool runs a 5-stage pipeline on a configurable schedule (default: every 6 hours via GitHub Actions).

```
┌─────────────┐    ┌──────────────┐    ┌────────────┐    ┌─────────┐    ┌──────────┐
│  1. SCRAPE   │───▶│ 2. DEDUPLICATE│───▶│ 3. VALIDATE │───▶│ 4. STORE │───▶│ 5. EXPORT │
│              │    │              │    │             │    │         │    │          │
│ 7 sources    │    │ by host:port │    │ judge       │    │ SQLite  │    │ txt/json │
│ in parallel  │    │ normalize    │    │ google 204  │    │ upsert  │    │ stats    │
│              │    │              │    │ latency     │    │         │    │ README   │
└─────────────┘    └──────────────┘    └────────────┘    └─────────┘    └──────────┘
```

## Stage 1: Scrape

Each source has its own fetcher in `src/scrapers/`. All run in parallel via `Promise.allSettled()` — one source failing doesn't block the others.

### Sources

| Source | Type | Update Frequency | Format | Notes |
|--------|------|-----------------|--------|-------|
| **ProxyScrape** | REST API | Every minute | Raw text | Filterable by protocol, timeout, country |
| **Geonode** | REST API | Every 5 min | JSON | Has `google_pass` flag built-in |
| **TheSpeedX** | GitHub raw | Hourly | Text files | Separate files per protocol, high volume |
| **Proxifly** | GitHub raw | Every 5 min | JSON | Structured with metadata |
| **Shodan** | REST API | On-demand | JSON | Searches for open proxy ports (1080, 3128, 8080). Requires `SHODAN_API_KEY`. |
| **Censys** | REST API | On-demand | JSON | Searches for open proxy services. Requires `CENSYS_API_ID` + `CENSYS_API_SECRET`. |
| **Scanner** | Active probe | On-demand | Raw | Port-scans IP ranges from `data/scan-targets.txt`, respects `data/scan-exclude.txt`. Disabled by default (`SCANNER_ENABLED=true` to enable). |

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
}
```

## Stage 2: Deduplicate

After all sources return, proxies are merged and deduplicated:

1. Normalize host to lowercase, trim whitespace
2. Generate key as `{host}:{port}`
3. First-seen wins — if same proxy appears in multiple sources, keep the first one (preserves richer metadata from structured sources like Geonode)

## Stage 3: Validate

The most resource-intensive stage. Uses `p-limit` to cap concurrent outbound connections.

### Checks Performed

| Check | Method | Pass Condition |
|-------|--------|---------------|
| **Alive** | HTTP GET through proxy to judge server | HTTP 200 within timeout |
| **Anonymity** | Parse returned headers from judge | See anonymity classification below |
| **Google Pass** | GET `https://www.google.com/generate_204` through proxy | HTTP 204 response |
| **Latency** | `Date.now()` delta around the alive check | Recorded in milliseconds |

### Anonymity Classification

The validator sends a request through the proxy to a **judge server** — a simple HTTP endpoint that echoes back all received request headers as JSON.

| Level | Condition |
|-------|-----------|
| **elite** | Real IP not in headers, no `Via`/`X-Forwarded-For`/`Proxy-Connection` headers |
| **anonymous** | Real IP not in headers, but proxy-identifying headers present |
| **transparent** | Real IP appears in `X-Forwarded-For` or similar headers |
| **unknown** | Validation failed or inconclusive |

### Judge Server

Self-hosted, minimal — a 10-line Hono endpoint:

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
  └── p-limit(100) ← configurable, hard max 200
        ├── validateProxy(proxy1) → axios through ProxyAgent
        ├── validateProxy(proxy2) → axios through ProxyAgent
        ├── validateProxy(proxy3) → ...
        └── ... (up to 100 concurrent)
```

For future scale: move to `worker_threads` with a shared work queue.

## Stage 4: Store

SQLite with WAL mode. Single `proxy` table, upserted by `proxy_id` (natural key = `host:port`).

See [`migrations/001_init.sql`](../migrations/001_init.sql) for full schema.

### Upsert Strategy

```sql
INSERT INTO proxy
  (proxy_id, host, port, protocol, anonymity, latency_ms, google_pass, alive,
   hijacked, hijack_type, hijack_body, asn, country, source, last_checked, created_at)
VALUES (...)
ON CONFLICT(proxy_id) DO UPDATE SET
  anonymity    = excluded.anonymity,
  latency_ms   = excluded.latency_ms,
  google_pass  = excluded.google_pass,
  alive        = excluded.alive,
  hijacked     = excluded.hijacked,
  hijack_type  = excluded.hijack_type,
  hijack_body  = excluded.hijack_body,
  asn          = excluded.asn,
  country      = excluded.country,
  source       = excluded.source,
  last_checked = excluded.last_checked
```

This means:
- New proxies get inserted
- Known proxies get their validation results updated
- Dead proxies stay in the DB with `alive = 0` (historical record)

## Stage 5: Export

After storage, the exporter generates:

1. **Flat text files** in `proxies/` — one `host:port` per line, split by protocol and quality tier
2. **Threat-intel files** in `proxies/` — hijacked proxy records for downstream consumption:
   - `proxies/hijacked.txt` — plain list of hijacked proxy IPs (`host:port` per line)
   - `proxies/hijacked.json` — full hijacked proxy details with classification (`hijack_type`, `hijack_body`, `country`, `asn`)
   - `proxies/malicious-asn.txt` — ASNs ranked by hijacked proxy count
3. **JSON exports** in `data/` — full structured data + stats snapshot
4. **README update** — replaces the stats section between `<!-- STATS_START -->` and `<!-- STATS_END -->` markers

## Deployment Model

### GitHub Actions (Primary)

```yaml
schedule:
  - cron: '0 */6 * * *'  # every 6 hours
```

The Actions workflow:
1. Checks out the repo
2. Installs dependencies
3. Downloads GeoLite2-Country and GeoLite2-ASN databases when `MAXMIND_LICENSE_KEY` is set
4. Runs `npm run pipeline`
5. Commits changed files in `proxies/` and `data/` back to the repo
6. Updates README stats

**Optional env vars:**
- `MAXMIND_LICENSE_KEY` — enables offline geolocation (country + ASN)
- `SHODAN_API_KEY` — enables Shodan proxy discovery
- `CENSYS_API_ID` + `CENSYS_API_SECRET` — enables Censys proxy discovery
- `SCANNER_ENABLED=true` — enables active port scanning against `data/scan-targets.txt`

Every run uses a fresh Azure runner IP — good for avoiding rate limits on proxy sources.

### Local / VPS (Optional)

For real-time API access:
1. Run `npm start` — starts Hono server + background cron
2. Pipeline runs on schedule, API serves latest results from SQLite
3. Judge endpoint self-hosted on the same server

**Rule:** Never run the validator on the same VPS as production scraping apps. Treat validator nodes as throwaway.

## Opt-out System

IP operators can request that their IPs or CIDR ranges be excluded from the active scanner:

```
POST /optout
Content-Type: application/json

{ "ip": "1.2.3.4" }        — exclude a single IP
{ "cidr": "1.2.3.0/24" }   — exclude a CIDR range
```

Exclusions are appended to `data/scan-exclude.txt`. The scanner reads this file at startup on every run and skips any IPs matching an excluded entry. The file is committed back to the repo by the Actions workflow, so exclusions persist across runs.

## Threat Model

See [SECURITY.md](SECURITY.md) for the full threat analysis and mitigations.
