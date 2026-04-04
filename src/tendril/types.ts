// ─── Tendril Types ────────────────────────────────────────────────────────────
// Shared types for the Tendril distributed scraping subsystem.
// DB types use snake_case; TS runtime uses camelCase per CONVENTIONS.md.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'active' | 'accomplished' | 'completed' | 'paused' | 'failed';
export type TransactionType = 'genesis' | 'job_allocation' | 'execution_transfer' | 'self_execution' | 'seed_reward';
export type ResultAckStatus = 'pending' | 'acknowledged' | 'failed';
export type WorkerSortBehavior = 'by_priority' | 'by_value' | 'by_creation';

// ─── Vector Clock ─────────────────────────────────────────────────────────────

export interface VectorClock {
  [nodeId: string]: number;
}

// ─── Retry Policy ─────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

// ─── Job (Runtime) ────────────────────────────────────────────────────────────

export interface Job {
  jobId: string;
  createdBy: string;
  createdAt: number;             // epoch seconds

  targetUrl: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headerJson?: string;           // JSON-serialized headers
  bodyJson?: string;             // JSON-serialized body
  proxyUrl?: string;             // optional proxy to route through

  minCompletion: number;
  maxCompletion: number;
  limitPerNode: number;

  status: JobStatus;

  timeoutMs: number;
  retryMax: number;
  retryDelayMs: number;
  retryMaxDelayMs: number;
  retryBackoff: number;

  multiplier: number;
  isSeed: boolean;
  isPublic: boolean;
  deletedAt?: number;

  vectorClock: VectorClock;
}

// ─── Job (DB Row) ─────────────────────────────────────────────────────────────

export interface JobRow {
  job_id: string;
  created_by: string;
  created_at: number;
  target_url: string;
  http_method: string;
  header_json: string | null;
  body_json: string | null;
  proxy_url: string | null;
  min_completion: number;
  max_completion: number;
  limit_per_node: number;
  status: string;
  timeout_ms: number;
  retry_max: number;
  retry_delay_ms: number;
  retry_max_delay_ms: number;
  retry_backoff: number;
  multiplier: number;
  is_seed: number;
  is_public: number;
  deleted_at: number | null;
  vector_clock: string;         // JSON-serialized VectorClock
}

// ─── Execution Result ─────────────────────────────────────────────────────────

export interface ExecutionResult {
  resultId: string;
  jobId: string;
  nodeId: string;
  timestamp: number;
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  error?: string;
  durationMs: number;
  targetUrl?: string;
  transactionId?: string;
  scrapsEarned?: number;
  workerId?: string;
  ackStatus?: ResultAckStatus;
  ackTimestamp?: number;
  ackSignature?: string;
}

// ─── Scraps Transaction (Runtime) ─────────────────────────────────────────────

export interface ScrapTransaction {
  transactionId: string;
  createdAt: number;
  fromNodeId: string;
  toNodeId: string;
  type: TransactionType;
  amount: number;
  jobId?: string;
  multiplier?: number;
  resultId?: string;
  previousHash: string;
  hash: string;
  signature: string;
}

// ─── Job Allocation ───────────────────────────────────────────────────────────

export interface JobAllocation {
  jobId: string;
  creatorNodeId: string;
  totalAllocated: number;
  totalSpent: number;
  multiplier: number;
}

// ─── Tendril Node ─────────────────────────────────────────────────────────────

export interface TendrilNodeInfo {
  nodeId: string;
  nickname?: string;
  firstSeen: number;
  lastSeen: number;
  executionCount: number;
}

// ─── PN-Counter CRDT ──────────────────────────────────────────────────────────

export interface PNCounter {
  P: Record<string, number>;    // positive increments per node
  N: Record<string, number>;    // negative decrements per node
}

// ─── Peer Info ────────────────────────────────────────────────────────────────

export interface PeerInfo {
  id: string;
  connectedAt: number;
  stat: {
    received: number;
    sent: number;
  };
}

// ─── Worker Configuration ─────────────────────────────────────────────────────

export interface WorkerJobFilter {
  includeStarred: boolean;
  includeRegular: boolean;
  includeCompleted: boolean;
}

export interface WorkerConfig {
  id: string;
  name: string;
  enabled: boolean;
  executionDelay: number;
  priorityThreshold: number;
  maxConcurrent: number;
  jobFilter: WorkerJobFilter;
  sortBehavior: WorkerSortBehavior;
  targetedJobId?: string;
}

// ─── Job Preference ───────────────────────────────────────────────────────────

export interface JobPreference {
  jobId: string;
  starred: boolean;
  priority: number;            // 1-5 starred, 6-10 regular
  note?: string;
  updatedAt: number;
}

// ─── P2P Message Types ────────────────────────────────────────────────────────

export enum MessageType {
  HELLO = 0x01,
  HELLO_ACK = 0x02,
  JOB_ANNOUNCE = 0x10,
  JOB_REQUEST = 0x11,
  JOB_RESPONSE = 0x12,
  JOB_BATCH_REQUEST = 0x13,
  JOB_BATCH_RESPONSE = 0x14,
  JOB_UPDATE = 0x15,
  COMPLETION_UPDATE = 0x20,
  COMPLETION_SYNC = 0x21,
  RESULT_ANNOUNCE = 0x30,
  RESULT_SUBMIT = 0x31,
  RESULT_ACK = 0x32,
  RESULT_REQUEST = 0x33,
  RESULT_RESPONSE = 0x34,
  NICKNAME_SYNC_REQUEST = 0x60,
  NICKNAME_SYNC_RESPONSE = 0x61,
  NICKNAME_ANNOUNCE = 0x62,
}

// ─── P2P Message Envelope ─────────────────────────────────────────────────────

export interface Message {
  type: MessageType;
  id: string;
  timestamp: number;
  senderId: string;
  payload: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Golden ratio — reward for executing unaccomplished jobs. */
export const SCRAP_REWARD = 1.61803398875;

/** Cost per minimum execution when creating a job. */
export const SCRAP_COST_PER_EXECUTION = 1;

/** Root node ID — source of seed job rewards. */
export const ROOT_NODE_ID = '0';

/** Default priority for non-starred jobs. */
export const DEFAULT_JOB_PRIORITY = 6;

/** Starred priority range. */
export const STARRED_PRIORITY_MIN = 1;
export const STARRED_PRIORITY_MAX = 5;

/** Regular priority range. */
export const REGULAR_PRIORITY_MIN = 6;
export const REGULAR_PRIORITY_MAX = 10;

/** Default public swarm topic. */
export const PUBLIC_TOPIC = 'worldpool';
