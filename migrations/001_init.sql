-- 001_init.sql
-- Initialize the proxy table and all required indexes.
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS proxy (
  proxy_id      TEXT    PRIMARY KEY,                          -- natural key: "host:port"
  host          TEXT    NOT NULL,
  port          INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  protocol      TEXT    NOT NULL CHECK (protocol IN ('http', 'socks4', 'socks5')),
  anonymity     TEXT    NOT NULL CHECK (anonymity IN ('elite', 'anonymous', 'transparent', 'unknown')),
  latency_ms    INTEGER NOT NULL CHECK (latency_ms >= -1),   -- -1 = unmeasured
  google_pass   INTEGER NOT NULL DEFAULT 0,                  -- 0 = fail, 1 = pass
  alive         INTEGER NOT NULL DEFAULT 0,                  -- 0 = dead, 1 = alive
  country       TEXT,                                         -- ISO 3166-1 alpha-2 (e.g., "PH", "US")
  source        TEXT,                                         -- which scraper found it
  last_checked  INTEGER NOT NULL,                            -- unix epoch seconds
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())       -- unix epoch seconds
);

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_proxy_alive        ON proxy (alive);
CREATE INDEX IF NOT EXISTS idx_proxy_anonymity    ON proxy (anonymity);
CREATE INDEX IF NOT EXISTS idx_proxy_google_pass  ON proxy (google_pass);
CREATE INDEX IF NOT EXISTS idx_proxy_protocol     ON proxy (protocol);
CREATE INDEX IF NOT EXISTS idx_proxy_latency_ms   ON proxy (latency_ms);
CREATE INDEX IF NOT EXISTS idx_proxy_last_checked ON proxy (last_checked);
CREATE INDEX IF NOT EXISTS idx_proxy_country      ON proxy (country);

-- Compound indexes for common API queries
CREATE INDEX IF NOT EXISTS idx_proxy_alive_protocol   ON proxy (alive, protocol);
CREATE INDEX IF NOT EXISTS idx_proxy_alive_anonymity  ON proxy (alive, anonymity);
CREATE INDEX IF NOT EXISTS idx_proxy_alive_latency    ON proxy (alive, latency_ms);
