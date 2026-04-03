-- 004_add_uptime.sql
-- Add uptime / reliability tracking columns to the proxy table.
-- Idempotent — safe to run multiple times.

ALTER TABLE proxy ADD COLUMN check_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proxy ADD COLUMN alive_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proxy ADD COLUMN reliability_pct REAL    NOT NULL DEFAULT 0.0;
CREATE INDEX IF NOT EXISTS idx_proxy_reliability ON proxy (reliability_pct);
