-- 007_tendril_node.sql
-- Node registry, per-node execution counts, and job preferences.
-- Uses tendril_node (not "node") to avoid naming ambiguity.
-- Idempotent — safe to run multiple times.

-- Known nodes in the swarm
CREATE TABLE IF NOT EXISTS tendril_node (
  node_id           TEXT    PRIMARY KEY,
  nickname          TEXT,
  first_seen        INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen         INTEGER NOT NULL DEFAULT (unixepoch()),
  execution_count   INTEGER NOT NULL DEFAULT 0
);

-- Per-node per-job execution counts (enforces limit_per_node)
CREATE TABLE IF NOT EXISTS node_execution (
  node_id           TEXT    NOT NULL,
  job_id            TEXT    NOT NULL REFERENCES job(job_id),
  execution_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (node_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_ne_job ON node_execution (job_id);

-- Per-node job preferences (local only, not synced across swarm)
CREATE TABLE IF NOT EXISTS job_preference (
  job_id            TEXT    PRIMARY KEY REFERENCES job(job_id),
  starred           INTEGER NOT NULL DEFAULT 0,
  priority          INTEGER NOT NULL DEFAULT 6
                     CHECK (priority >= 1 AND priority <= 10),
  note              TEXT,
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_jp_starred ON job_preference (starred);
