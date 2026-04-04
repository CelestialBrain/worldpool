-- 009: Add site_pass column — JSON string of per-site check results.
-- Example: {"google":true,"discord":false,"tiktok":true,...}
ALTER TABLE proxy ADD COLUMN site_pass TEXT DEFAULT NULL;
