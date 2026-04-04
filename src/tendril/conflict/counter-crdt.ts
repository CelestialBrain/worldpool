// ─── PN-Counter CRDT ──────────────────────────────────────────────────────────
// Positive-Negative Counter for distributed completion counting.
// Each node independently increments; merge via max per node.

import type { PNCounter } from '../types.js';

export class CompletionCounter {
  private counter: Map<string, PNCounter> = new Map();

  constructor(private nodeId: string) {}

  /** Ensure a counter exists for a job. */
  private ensureCounter(jobId: string): PNCounter {
    if (!this.counter.has(jobId)) {
      this.counter.set(jobId, { P: {}, N: {} });
    }
    return this.counter.get(jobId)!;
  }

  /** Increment completion count (success). */
  increment(jobId: string): void {
    const c = this.ensureCounter(jobId);
    c.P[this.nodeId] = (c.P[this.nodeId] || 0) + 1;
  }

  /** Decrement (corrections/rollbacks). */
  decrement(jobId: string): void {
    const c = this.ensureCounter(jobId);
    c.N[this.nodeId] = (c.N[this.nodeId] || 0) + 1;
  }

  /** Get current net value for a job. */
  getValue(jobId: string): number {
    const c = this.counter.get(jobId);
    if (!c) return 0;

    const positiveSum = Object.values(c.P).reduce((a, b) => a + b, 0);
    const negativeSum = Object.values(c.N).reduce((a, b) => a + b, 0);
    return positiveSum - negativeSum;
  }

  /** Merge remote counter state — take max for each node per side. */
  merge(jobId: string, remote: PNCounter): void {
    const local = this.ensureCounter(jobId);

    for (const [nodeId, value] of Object.entries(remote.P)) {
      local.P[nodeId] = Math.max(local.P[nodeId] || 0, value);
    }
    for (const [nodeId, value] of Object.entries(remote.N)) {
      local.N[nodeId] = Math.max(local.N[nodeId] || 0, value);
    }
  }

  /** Get state for a specific job (for broadcasting). */
  getState(jobId: string): PNCounter | undefined {
    return this.counter.get(jobId);
  }

  /** Get all counter states (for full sync). */
  getAllStates(): Record<string, PNCounter> {
    const result: Record<string, PNCounter> = {};
    for (const [jobId, c] of this.counter) {
      result[jobId] = c;
    }
    return result;
  }

  /** Restore from serialized state. */
  restore(data: Record<string, PNCounter>): void {
    for (const [jobId, c] of Object.entries(data)) {
      this.merge(jobId, c);
    }
  }

  /** Remove counter for a job. */
  remove(jobId: string): void {
    this.counter.delete(jobId);
  }

  /** Get all job IDs with counters. */
  getJobIds(): string[] {
    return Array.from(this.counter.keys());
  }

  /** Check if counter exists for a job. */
  has(jobId: string): boolean {
    return this.counter.has(jobId);
  }

  /** Get this node's local contribution to a job's count. */
  getLocalContribution(jobId: string): number {
    const c = this.counter.get(jobId);
    if (!c) return 0;
    return (c.P[this.nodeId] || 0) - (c.N[this.nodeId] || 0);
  }
}
