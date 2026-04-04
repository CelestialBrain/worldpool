-- 005_tendril_job.sql
-- Tendril distributed job table — stores scraping/validation jobs
-- distributed across the P2P swarm. Adapted from TendrilHive's LevelDB schema.
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS job (
  job_id            TEXT    PRIMARY KEY,
  created_by        TEXT    NOT NULL,                           -- node ID of job creator ('root' for seed jobs)
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Target
  target_url        TEXT    NOT NULL,
  http_method       TEXT    NOT NULL DEFAULT 'GET'
                     CHECK (http_method IN ('GET','POST','PUT','DELETE','PATCH')),
  header_json       TEXT,                                      -- JSON object of request headers
  body_json         TEXT,                                      -- JSON string or serialized object
  proxy_url         TEXT,                                      -- optional: route request through this proxy

  -- Completion tracking
  min_completion    INTEGER NOT NULL DEFAULT 1,
  max_completion    INTEGER NOT NULL DEFAULT 10,
  limit_per_node    INTEGER NOT NULL DEFAULT 100,              -- max times a single node can execute

  -- State machine: pending → active → accomplished → completed
  status            TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','accomplished','completed','paused','failed')),

  -- Execution policy
  timeout_ms        INTEGER NOT NULL DEFAULT 30000,
  retry_max         INTEGER NOT NULL DEFAULT 3,
  retry_delay_ms    INTEGER NOT NULL DEFAULT 1000,
  retry_max_delay_ms INTEGER NOT NULL DEFAULT 30000,
  retry_backoff     REAL    NOT NULL DEFAULT 2.0,

  -- Economy
  multiplier        REAL    NOT NULL DEFAULT 1.0
                     CHECK (multiplier >= 1.0 AND multiplier <= 10.0),

  -- Flags
  is_seed           INTEGER NOT NULL DEFAULT 0,                -- infinite min_completion, rewards from root
  is_public         INTEGER NOT NULL DEFAULT 0,                -- anyone can download results
  deleted_at        INTEGER,                                   -- soft delete timestamp

  -- Conflict resolution (JSON-serialized vector clock)
  vector_clock      TEXT    NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_job_status     ON job (status);
CREATE INDEX IF NOT EXISTS idx_job_created_by ON job (created_by);
CREATE INDEX IF NOT EXISTS idx_job_is_seed    ON job (is_seed);
