// ─── Conflict Resolver ────────────────────────────────────────────────────────
// Last-Writer-Wins with vector clocks and deterministic tiebreakers.

import type { Job } from '../types.js';
import { VectorClockUtils } from './vector-clock.js';

export class ConflictResolver {
  /** Resolve job conflicts using LWW with Vector Clocks. */
  static resolveJob(local: Job, remote: Job): Job {
    const comparison = VectorClockUtils.compare(local.vectorClock, remote.vectorClock);

    switch (comparison) {
      case 'before':   return remote;  // remote is newer
      case 'after':    return local;   // local is newer
      case 'equal':    return local;   // same version
      case 'concurrent': return this.resolveConcurrent(local, remote);
    }
  }

  /** Deterministic tiebreaker for concurrent updates. */
  private static resolveConcurrent(a: Job, b: Job): Job {
    // 1. Prefer higher multiplier (more valuable job)
    if (a.multiplier !== b.multiplier) {
      return a.multiplier > b.multiplier ? a : b;
    }
    // 2. Prefer more recent timestamp
    if (a.createdAt !== b.createdAt) {
      return a.createdAt > b.createdAt ? a : b;
    }
    // 3. Lexicographic comparison of ID (deterministic fallback)
    return a.jobId < b.jobId ? a : b;
  }

  /** Merge two jobs — resolve conflict and combine vector clocks. */
  static mergeJobs(local: Job, remote: Job): Job {
    const resolved = this.resolveJob(local, remote);
    return {
      ...resolved,
      vectorClock: VectorClockUtils.merge(local.vectorClock, remote.vectorClock),
    };
  }

  /** Check if we should accept a remote job update. */
  static shouldAcceptUpdate(local: Job | null, remote: Job): boolean {
    if (!local) return true;
    const comparison = VectorClockUtils.compare(local.vectorClock, remote.vectorClock);
    return comparison === 'before' || comparison === 'concurrent';
  }
}
