// ─── Job DAL ──────────────────────────────────────────────────────────────────
// SQLite data access layer for Tendril jobs.
// All DB access goes through this module per CONVENTIONS.md.

import { getDb } from '../utils/db.js';
import type { Job, JobRow, JobStatus } from '../tendril/types.js';

// ─── Row ↔ Runtime Mapping ────────────────────────────────────────────────────

function rowToJob(row: JobRow): Job {
  return {
    jobId: row.job_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    targetUrl: row.target_url,
    httpMethod: row.http_method as Job['httpMethod'],
    headerJson: row.header_json ?? undefined,
    bodyJson: row.body_json ?? undefined,
    proxyUrl: row.proxy_url ?? undefined,
    minCompletion: row.min_completion,
    maxCompletion: row.max_completion,
    limitPerNode: row.limit_per_node,
    status: row.status as JobStatus,
    timeoutMs: row.timeout_ms,
    retryMax: row.retry_max,
    retryDelayMs: row.retry_delay_ms,
    retryMaxDelayMs: row.retry_max_delay_ms,
    retryBackoff: row.retry_backoff,
    multiplier: row.multiplier,
    isSeed: row.is_seed === 1,
    isPublic: row.is_public === 1,
    deletedAt: row.deleted_at ?? undefined,
    vectorClock: JSON.parse(row.vector_clock),
  };
}

function jobToRow(job: Job): Record<string, unknown> {
  return {
    job_id: job.jobId,
    created_by: job.createdBy,
    created_at: job.createdAt,
    target_url: job.targetUrl,
    http_method: job.httpMethod,
    header_json: job.headerJson ?? null,
    body_json: job.bodyJson ?? null,
    proxy_url: job.proxyUrl ?? null,
    min_completion: job.minCompletion,
    max_completion: job.maxCompletion,
    limit_per_node: job.limitPerNode,
    status: job.status,
    timeout_ms: job.timeoutMs,
    retry_max: job.retryMax,
    retry_delay_ms: job.retryDelayMs,
    retry_max_delay_ms: job.retryMaxDelayMs,
    retry_backoff: job.retryBackoff,
    multiplier: job.multiplier,
    is_seed: job.isSeed ? 1 : 0,
    is_public: job.isPublic ? 1 : 0,
    deleted_at: job.deletedAt ?? null,
    vector_clock: JSON.stringify(job.vectorClock),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const INSERT_SQL = `
  INSERT INTO job (
    job_id, created_by, created_at,
    target_url, http_method, header_json, body_json, proxy_url,
    min_completion, max_completion, limit_per_node,
    status, timeout_ms, retry_max, retry_delay_ms, retry_max_delay_ms, retry_backoff,
    multiplier, is_seed, is_public, deleted_at, vector_clock
  ) VALUES (
    $job_id, $created_by, $created_at,
    $target_url, $http_method, $header_json, $body_json, $proxy_url,
    $min_completion, $max_completion, $limit_per_node,
    $status, $timeout_ms, $retry_max, $retry_delay_ms, $retry_max_delay_ms, $retry_backoff,
    $multiplier, $is_seed, $is_public, $deleted_at, $vector_clock
  ) ON CONFLICT(job_id) DO UPDATE SET
    status = excluded.status,
    deleted_at = excluded.deleted_at,
    vector_clock = excluded.vector_clock
`;

export const jobModel = {
  /** Upsert a job. */
  save(job: Job): void {
    const db = getDb();
    const params = jobToRow(job);
    db.prepare(INSERT_SQL).run(params);
  },

  /** Get a job by ID. */
  get(jobId: string): Job | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM job WHERE job_id = ?').get(jobId) as JobRow | undefined;
    return row ? rowToJob(row) : null;
  },

  /** Get all jobs (non-deleted, with optional status filter). */
  getAll(status?: JobStatus, limit: number = 100): Job[] {
    const db = getDb();
    let sql = 'SELECT * FROM job WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as JobRow[];
    return rows.map(rowToJob);
  },

  /** Get executable jobs (pending/active/accomplished, not deleted). */
  getExecutable(): Job[] {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM job
       WHERE deleted_at IS NULL
         AND status IN ('pending', 'active', 'accomplished')
       ORDER BY created_at DESC`,
    ).all() as JobRow[];
    return rows.map(rowToJob);
  },

  /** Get all job summaries for P2P sync. */
  getAllSummaries(): Array<{ id: string; vectorClock: Record<string, number> }> {
    const db = getDb();
    const rows = db.prepare('SELECT job_id, vector_clock FROM job').all() as { job_id: string; vector_clock: string }[];
    return rows.map(r => ({
      id: r.job_id,
      vectorClock: JSON.parse(r.vector_clock),
    }));
  },

  /** Update job status. */
  updateStatus(jobId: string, status: JobStatus): void {
    const db = getDb();
    db.prepare('UPDATE job SET status = ? WHERE job_id = ?').run(status, jobId);
  },

  /** Soft delete a job. */
  softDelete(jobId: string): void {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE job SET deleted_at = ? WHERE job_id = ?').run(now, jobId);
  },

  /** Count jobs by status. */
  countByStatus(): Record<string, number> {
    const db = getDb();
    const rows = db.prepare(
      'SELECT status, COUNT(*) as count FROM job WHERE deleted_at IS NULL GROUP BY status',
    ).all() as { status: string; count: number }[];

    const result: Record<string, number> = {};
    for (const row of rows) result[row.status] = row.count;
    return result;
  },

  /** Save batch of jobs in a transaction. */
  saveBatch(jobs: Job[]): void {
    const db = getDb();
    const stmt = db.prepare(INSERT_SQL);
    const txn = db.transaction((batch: Job[]) => {
      for (const job of batch) stmt.run(jobToRow(job));
    });
    txn(jobs);
  },
};
