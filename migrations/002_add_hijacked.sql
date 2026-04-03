-- 002_add_hijacked.sql
-- Add hijack detection column to proxy table.
-- Idempotent — safe to run multiple times.

ALTER TABLE proxy ADD COLUMN hijacked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_proxy_hijacked ON proxy (hijacked);
