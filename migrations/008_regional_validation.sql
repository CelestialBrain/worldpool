-- 008_regional_validation.sql
-- Multi-region proxy validation results from distributed Tendril nodes.
-- This is the killer feature: a proxy validated from PH, US, and DE
-- simultaneously provides data no existing proxy list publishes.
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS regional_validation (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy_id          TEXT    NOT NULL REFERENCES proxy(proxy_id),
  region            TEXT    NOT NULL,                           -- ISO 3166-1 alpha-2 of the validating node
  node_id           TEXT    NOT NULL,                           -- tendril_node that performed validation
  alive             INTEGER NOT NULL DEFAULT 0,
  latency_ms        INTEGER NOT NULL DEFAULT -1,
  google_pass       INTEGER NOT NULL DEFAULT 0,
  checked_at        INTEGER NOT NULL,
  UNIQUE (proxy_id, node_id, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_rv_proxy  ON regional_validation (proxy_id);
CREATE INDEX IF NOT EXISTS idx_rv_region ON regional_validation (region);
CREATE INDEX IF NOT EXISTS idx_rv_node   ON regional_validation (node_id);
CREATE INDEX IF NOT EXISTS idx_rv_alive  ON regional_validation (alive);
