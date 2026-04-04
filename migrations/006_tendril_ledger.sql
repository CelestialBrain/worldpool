-- 006_tendril_ledger.sql
-- Scraps economy — blockchain-style transaction chain for the reward system.
-- Uses scrap_transaction (not "transaction") to avoid SQLite reserved word.
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS scrap_transaction (
  transaction_id    TEXT    PRIMARY KEY,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  from_node_id      TEXT    NOT NULL,
  to_node_id        TEXT    NOT NULL,
  type              TEXT    NOT NULL
                     CHECK (type IN ('genesis','job_allocation','execution_transfer','self_execution','seed_reward')),
  amount            REAL    NOT NULL CHECK (amount >= 0),
  job_id            TEXT,                                      -- related job (if applicable)
  multiplier        REAL,                                      -- job multiplier at time of transaction
  result_id         TEXT,                                      -- linked execution result (replay protection)
  previous_hash     TEXT    NOT NULL,
  hash              TEXT    NOT NULL UNIQUE,
  signature         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stx_from   ON scrap_transaction (from_node_id);
CREATE INDEX IF NOT EXISTS idx_stx_to     ON scrap_transaction (to_node_id);
CREATE INDEX IF NOT EXISTS idx_stx_job    ON scrap_transaction (job_id);
CREATE INDEX IF NOT EXISTS idx_stx_type   ON scrap_transaction (type);

-- Job allocation tracking — reserves scraps when a job is created
CREATE TABLE IF NOT EXISTS job_allocation (
  job_id            TEXT    PRIMARY KEY REFERENCES job(job_id),
  creator_node_id   TEXT    NOT NULL,
  total_allocated   REAL    NOT NULL DEFAULT 0,
  total_spent       REAL    NOT NULL DEFAULT 0,
  multiplier        REAL    NOT NULL DEFAULT 1.0
);
