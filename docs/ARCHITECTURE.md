# Architecture

Technical deep-dive into Worldpool's pipeline, validation strategy, and deployment model.

## Pipeline Overview

Worldpool runs a 5-stage pipeline on a configurable schedule (default: every 6 hours via GitHub Actions).

```
┌─────────────┐    ┌──────────────┐    ┌────────────┐    ┌─────────┐    ┌──────────┐
│  1. SCRAPE   │───▶│ 2. DEDUPLICATE│───▶│ 3. VALIDATE │───▶│ 4. STORE │───▶│ 5. EXPORT │
│              │    │              │    │             │    │         │    │          │
│ 4 sources    │    │ by host:port │    │ judge       │    │ SQLite  │    │ txt/json │
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
INSERT INTO proxy (...) VALUES (...)
ON CONFLICT(proxy_id) DO UPDATE SET
  anonymity    = excluded.anonymity,
  latency_ms   = excluded.latency_ms,
  google_pass  = excluded.google_pass,
  alive        = excluded.alive,
  last_checked = excluded.last_checked
```

This means:
- New proxies get inserted
- Known proxies get their validation results updated
- Dead proxies stay in the DB with `alive = 0` (historical record)

## Stage 5: Export

After storage, the exporter generates:

1. **Flat text files** in `proxies/` — one `host:port` per line, split by protocol and quality tier
2. **JSON exports** in `data/` — full structured data + stats snapshot
3. **README update** — replaces the stats section between `<!-- STATS_START -->` and `<!-- STATS_END -->` markers

## Deployment Model

### GitHub Actions (Primary)

```yaml
schedule:
  - cron: '0 */6 * * *'  # every 6 hours
```

The Actions workflow:
1. Checks out the repo
2. Installs dependencies
3. Runs `npm run pipeline`
4. Commits changed files in `proxies/` and `data/` back to the repo
5. Updates README stats

Every run uses a fresh Azure runner IP — good for avoiding rate limits on proxy sources.

### Local / VPS (Optional)

For real-time API access:
1. Run `npm start` — starts Hono server + background cron
2. Pipeline runs on schedule, API serves latest results from SQLite
3. Judge endpoint self-hosted on the same server

**Rule:** Never run the validator on the same VPS as production scraping apps. Treat validator nodes as throwaway.

## Threat Model

See [SECURITY.md](SECURITY.md) for the full threat analysis and mitigations.
