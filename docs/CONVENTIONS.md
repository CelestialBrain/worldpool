# Database & Code Conventions

Rules for writing consistent, refactorable code in the Worldpool codebase.

## Database

| Convention             | Rule                                                      | Example                                                  |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| **Primary keys**       | Always `{table}_id`                                       | `proxy_id`                                               |
| **Foreign keys**       | Match the PK name exactly                                 | `FK → proxy_id`                                          |
| **User-facing IDs**    | Natural key as `TEXT`                                      | `proxy_id TEXT PRIMARY KEY` (value = `host:port`)        |
| **Internal IDs**       | `INTEGER PRIMARY KEY AUTOINCREMENT` (SQLite)               | Only when no natural key exists                          |
| **Column naming**      | `snake_case`, never camelCase                             | `last_checked`, `latency_ms`, `google_pass`              |
| **Table naming**       | Singular noun, no reserved words                          | `proxy` (not `proxies`), `source` (not `sources`)        |
| **Timestamps**         | `INTEGER` storing Unix epoch seconds                      | `created_at INTEGER DEFAULT (unixepoch())`               |
| **Boolean columns**    | `INTEGER NOT NULL DEFAULT 0` (SQLite has no BOOLEAN)      | `alive INTEGER NOT NULL DEFAULT 0`                       |
| **Constrained values** | `CHECK` constraints (SQLite has no ENUMs)                 | `CHECK (protocol IN ('http', 'socks4', 'socks5'))`      |
| **Indexes**            | `idx_{table}_{column}`                                    | `idx_proxy_alive`, `idx_proxy_latency_ms`                |

### SQLite-Specific Rules

- No `TIMESTAMPTZ` — use `INTEGER` with `unixepoch()` for all timestamps
- No `ENUM` types — use `CHECK` constraints instead
- No `gen_random_uuid()` — use Node's `crypto.randomUUID()` when UUIDs are needed
- Use `WAL` journal mode and `NORMAL` synchronous for performance
- Transactions via `db.transaction()` for bulk inserts

## TypeScript

| Convention             | Rule                                             | Example                                               |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| **DB access**          | Always through `src/models/` DAL modules         | `import { proxyModel } from '../models/proxy.js'`     |
| **Row types**          | `{Table}Row` — matches DB columns, snake_case    | `ProxyRow { proxy_id, host, port, ... }`              |
| **API response types** | `{Table}Response` — clean shape for consumers    | `ProxyResponse { id, host, port, ... }`               |
| **Variables**          | camelCase in TS, snake_case only in SQL strings  | `const latencyMs = row.latency_ms`                    |
| **Imports**            | `.js` extension for local ESM imports            | `import { validate } from '../services/validator.js'` |
| **Config**             | Single `src/config.ts` exporting typed object    | `import { config } from '../config.js'`               |

## API Response Naming

All API endpoints follow these naming rules:

| Rule               | Pattern            | Bad                      | Good                       |
| ------------------ | ------------------ | ------------------------ | -------------------------- |
| **Scalars**        | Singular noun      | `free_slots: 5`          | `free_slot: 5`             |
| **Counts**         | `{singular}_count` | `total_proxies: 812`     | `proxy_count: 812`         |
| **Arrays**         | Singular noun      | `proxies: [...]`         | `proxy: [...]`             |
| **Measurements**   | Singular noun      | `avg_latency: 340`       | `avg_latency_ms: 340`      |
| **Booleans**       | Descriptive        | `pass: true`             | `google_pass: true`        |

### Quick Example

```typescript
// API response — all normalized
{
  proxy: [                        // arrays are SINGULAR
    {
      id: "203.0.113.1:8080",     // proxy_id aliased to id for consumers
      host: "203.0.113.1",
      port: 8080,
      protocol: "http",
      anonymity: "elite",
      latency_ms: 142,            // measurements include unit
      google_pass: true,
      country: "PH",
      last_checked: 1743696000
    }
  ],
  proxy_count: 1                  // counts use {singular}_count
}
```

## Response Shape (DAL → Route → Consumer)

| Layer              | Type name       | PK field                   | Example                       |
| ------------------ | --------------- | -------------------------- | ----------------------------- |
| **Raw DB schema**  | —               | `proxy_id`                 | `proxy_id TEXT PRIMARY KEY`   |
| **DAL (models/)**  | `ProxyRow`      | `proxy_id` (snake_case)    | `ProxyRow.proxy_id`           |
| **API response**   | `ProxyResponse` | aliased to `id`            | `{ id, host, port, ... }`    |

## Structured Logger

Use `createLogger(prefix)` from `src/utils/logger.ts` instead of bare `console.log`.
Returns `log.info()`, `log.warn()`, `log.error()`, `log.debug()` with Manila TZ timestamps and module prefix.
Filtering via `LOG_LEVEL` env var (`debug`, `info`, `warn`, `error`).

```typescript
import { createLogger } from '../utils/logger.js';
const log = createLogger('validator');

log.info('Validation complete', { alive_count: 812, elapsed_ms: 4200 });
log.error('Judge server unreachable', err);
log.debug('Proxy details', { host, port, latency_ms });
```

## File Organization

```
migrations/        ← SQLite schema (numbered, idempotent)
proxies/           ← Auto-generated flat files (committed by Actions)
data/              ← Auto-generated JSON exports + scanner config
  proxies.json
  stats.json
  scan-targets.txt ← IP ranges for the active scanner
  scan-exclude.txt ← IPs/CIDRs excluded from scanning (opt-out list)
infra/
  explainer/       ← Static explainer page (index.html + nginx.conf)
src/
  types.ts         ← ProxyRow, ProxyResponse, enums, shared types
  config.ts        ← Typed config with env overrides
  models/          ← SQLite DAL (proxy.ts — upsert, query, stats)
  services/        ← Business logic
    validator.ts
    pipeline.ts
    exporter.ts
    geolocator.ts  ← MaxMind GeoLite2-Country + GeoLite2-ASN lookups
    optout.ts      ← POST /optout endpoint + scan-exclude.txt writer
  middleware/      ← Hono middleware
    rate-limit.ts  ← 60 req/min per IP, sliding window
  scrapers/        ← Per-source fetchers (34 sources)
    index.ts       ← Declarative registry, dedup, 50k cap
    proxyscrape.ts   geonode.ts         thespeedx.ts
    proxifly.ts      monosans.ts        clarketm.ts
    hookzof.ts       fate0.ts           sunny9577.ts
    ercin.ts         murongpig.ts       r00tee.ts
    casa.ts          jetkai.ts          mmpx12.ts
    vakhov.ts        iplocate.ts        zloi.ts
    spysme.ts        databay.ts         prxchk.ts
    clearproxy.ts    dinoz0rg.ts        proxyscraper-gh.ts
    zevtyardt.ts     fyvri.ts           vmheaven.ts
    vanndev.ts       roosterkid.ts      freeproxylist.ts
    shodan.ts        censys.ts
    scanner/       ← Active port-scanner (tcp-probe.ts, fingerprint.ts, etc.)
  routes/          ← Hono HTTP handlers (no raw SQL)
  utils/           ← Shared utilities (logger, db connection)
  index.ts         ← Entry point (Hono server)
```

## Migration Conventions

- Files numbered `NNN_{description}.sql` (e.g., `001_init.sql`)
- Each migration is idempotent where possible (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
- Include a comment header with what the migration does
- SQLite migrations applied via a simple runner in `src/utils/db.ts`

## Tendril Subsystem Tables

The distributed scraping subsystem adds 7 new tables (migrations 005–008):

| Table                 | PK                        | Purpose                                     |
| --------------------- | ------------------------- | ------------------------------------------- |
| `job`                 | `job_id TEXT`              | Distributed scraping/validation jobs         |
| `scrap_transaction`   | `transaction_id TEXT`      | SHA256-chained reward ledger                 |
| `job_allocation`      | `job_id TEXT` (FK)         | Scraps reserved when a job is created        |
| `tendril_node`        | `node_id TEXT`             | Known peers in the swarm                     |
| `node_execution`      | `(node_id, job_id)` PK    | Per-node per-job execution counts            |
| `job_preference`      | `job_id TEXT` (FK)         | Local-only starred/priority metadata         |
| `regional_validation` | `id INTEGER AUTOINCREMENT` | Multi-region proxy validation results        |

> **Note:** `scrap_transaction` uses a non-standard name because `transaction` is a SQLite reserved word. `tendril_node` uses the prefix to avoid collision with the `node` runtime name.

### Tendril Naming

| Convention                | Rule                                                            |
| ------------------------- | --------------------------------------------------------------- |
| **Config prefix**         | `TENDRIL_` env vars for all Tendril settings                    |
| **Logger prefix**         | `tendril:{module}` (e.g., `tendril:swarm`, `tendril:executor`)  |
| **Runtime types**         | camelCase matching the table (e.g., `Job`, `TendrilNodeInfo`)   |
| **DB row types**          | `{Table}Row` with snake_case (e.g., `JobRow`)                   |
| **DAL modules**           | `src/models/{table}.ts` (e.g., `job.ts`, `regional.ts`)         |

### Tendril File Organization

```
src/tendril/
  types.ts           ← All types, enums, message types, constants
  config.ts          ← TENDRIL_* env var config
  declarations.d.ts  ← Type declarations for hyperswarm/b4a/msgpack
  core/
    node.ts          ← TendrilNode — main orchestrator
  p2p/
    swarm.ts         ← Hyperswarm DHT wrapper
    protocol.ts      ← MsgPack encode/decode + typed payloads
    handler.ts       ← Message router (20+ message types)
    peer.ts          ← Peer tracker
  conflict/
    vector-clock.ts  ← Compare, merge, increment operations
    resolver.ts      ← LWW with deterministic tiebreakers
    counter-crdt.ts  ← PN-Counter for completion counting
  job/
    model.ts         ← Zod v4 schemas + factory functions
    state.ts         ← State machine (6 states)
  execution/
    executor.ts      ← Proxy-aware HTTP execution
    rate-limiter.ts  ← Token bucket
    retry.ts         ← Exponential backoff
  sdk/
    tendril.ts       ← User-facing SDK: get/post/batch/getProxy
    proxy-pool.ts    ← Fetches Worldpool proxy lists from GitHub
  test/
    e2e.ts           ← Two-node integration test
```

