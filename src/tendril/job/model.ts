// ─── Job Model ────────────────────────────────────────────────────────────────
// Zod-validated job schema and factory functions.

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Job, VectorClock } from '../types.js';
import { DEFAULT_RETRY_POLICY } from '../types.js';

// ─── Zod Schema (full job) ────────────────────────────────────────────────────

export const JobSchema = z.object({
  jobId: z.string(),
  createdBy: z.string(),
  createdAt: z.number(),
  targetUrl: z.string().url(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headerJson: z.string().optional(),
  bodyJson: z.string().optional(),
  proxyUrl: z.string().optional(),
  minCompletion: z.number().int().min(1),
  maxCompletion: z.number().int().min(1),
  limitPerNode: z.number().int().min(1).default(100),
  status: z.enum(['pending', 'active', 'accomplished', 'completed', 'paused', 'failed']),
  timeoutMs: z.number().int().min(1000).default(30000),
  retryMax: z.number().int().min(0),
  retryDelayMs: z.number().int().min(0),
  retryMaxDelayMs: z.number().int().min(0),
  retryBackoff: z.number().min(1),
  multiplier: z.number().min(1).max(10).default(1),
  isSeed: z.boolean().default(false),
  isPublic: z.boolean().default(false),
  deletedAt: z.number().optional(),
  vectorClock: z.record(z.string(), z.number()),
}).check(ctx => {
  if (ctx.value.maxCompletion < ctx.value.minCompletion) {
    ctx.issues.push({ message: 'maxCompletion must be >= minCompletion' } as any);
  }
});

// ─── Create Job Schema (user input) ──────────────────────────────────────────

export const CreateJobSchema = z.object({
  targetUrl: z.string().url(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headerJson: z.string().optional(),
  bodyJson: z.string().optional(),
  proxyUrl: z.string().optional(),
  minCompletion: z.number().int().min(1).default(1),
  maxCompletion: z.number().int().min(1).default(10),
  limitPerNode: z.number().int().min(1).default(100),
  timeoutMs: z.number().int().min(1000).default(30000),
  multiplier: z.number().min(1).max(10).default(1),
  isPublic: z.boolean().default(false),
}).check(ctx => {
  if (ctx.value.maxCompletion < ctx.value.minCompletion) {
    ctx.issues.push({ message: 'maxCompletion must be >= minCompletion' } as any);
  }
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

// ─── Factory Functions ────────────────────────────────────────────────────────

/** Create a new job with defaults. */
export function createJob(input: CreateJobInput, nodeId: string): Job {
  const validated = CreateJobSchema.parse(input);
  const vectorClock: VectorClock = { [nodeId]: 1 };

  return {
    jobId: randomUUID(),
    createdBy: nodeId,
    createdAt: Math.floor(Date.now() / 1000),
    targetUrl: validated.targetUrl,
    httpMethod: validated.httpMethod,
    headerJson: validated.headerJson,
    bodyJson: validated.bodyJson,
    proxyUrl: validated.proxyUrl,
    minCompletion: validated.minCompletion,
    maxCompletion: validated.maxCompletion,
    limitPerNode: validated.limitPerNode,
    status: 'pending',
    timeoutMs: validated.timeoutMs,
    retryMax: DEFAULT_RETRY_POLICY.maxRetries,
    retryDelayMs: DEFAULT_RETRY_POLICY.initialDelay,
    retryMaxDelayMs: DEFAULT_RETRY_POLICY.maxDelay,
    retryBackoff: DEFAULT_RETRY_POLICY.backoffMultiplier,
    multiplier: validated.multiplier ?? 1,
    isSeed: false,
    isPublic: validated.isPublic ?? false,
    vectorClock,
  };
}

/** Create the seed job (google.com — infinite min, owned by root). */
export function createSeedJob(): Job {
  return {
    jobId: 'seed-job-google-com',
    createdBy: 'root',
    createdAt: 0,
    targetUrl: 'https://www.google.com',
    httpMethod: 'GET',
    minCompletion: Number.MAX_SAFE_INTEGER,
    maxCompletion: Number.MAX_SAFE_INTEGER,
    limitPerNode: 1000,
    status: 'active',
    timeoutMs: 10000,
    retryMax: DEFAULT_RETRY_POLICY.maxRetries,
    retryDelayMs: DEFAULT_RETRY_POLICY.initialDelay,
    retryMaxDelayMs: DEFAULT_RETRY_POLICY.maxDelay,
    retryBackoff: DEFAULT_RETRY_POLICY.backoffMultiplier,
    multiplier: 1,
    isSeed: true,
    isPublic: true,
    vectorClock: { root: 1 },
  };
}

/** Validate a job object. */
export function validateJob(job: unknown): { valid: boolean; error: string[] } {
  const result = JobSchema.safeParse(job);
  if (result.success) return { valid: true, error: [] };
  return {
    valid: false,
    error: result.error.issues.map((e: any) => `${(e.path ?? []).join('.')}: ${e.message}`),
  };
}
