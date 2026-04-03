-- 003_add_hijack_details.sql
-- Add hijack classification, body sample, and ASN columns to proxy table.
-- Idempotent — safe to run multiple times.

ALTER TABLE proxy ADD COLUMN hijack_type TEXT;
ALTER TABLE proxy ADD COLUMN hijack_body TEXT;
ALTER TABLE proxy ADD COLUMN asn         TEXT;
CREATE INDEX IF NOT EXISTS idx_proxy_hijack_type ON proxy (hijack_type);
