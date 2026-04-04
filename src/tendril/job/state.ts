// ─── Job State Machine ────────────────────────────────────────────────────────
// Valid state transitions for Tendril jobs.
//
// State Diagram:
//   PENDING → ACTIVE → ACCOMPLISHED → COMPLETED
//            ↓                        ↑
//           FAILED → (retry) → PENDING
//   Any state except COMPLETED → PAUSED → PENDING or ACTIVE

import type { Job, JobStatus } from '../types.js';

const transitions: Record<JobStatus, JobStatus[]> = {
  pending:      ['active', 'paused'],
  active:       ['accomplished', 'completed', 'paused', 'failed'],
  accomplished: ['completed', 'paused'],
  completed:    [],                     // terminal state
  paused:       ['pending', 'active'],
  failed:       ['pending'],            // can retry
};

export class JobStateMachine {
  /** Check if a state transition is valid. */
  static canTransition(from: JobStatus, to: JobStatus): boolean {
    return transitions[from]?.includes(to) ?? false;
  }

  /** Evaluate job status based on completion count. */
  static evaluateStatus(job: Job, currentCompletion: number): JobStatus {
    if (job.status === 'paused' || job.status === 'failed') {
      return job.status;
    }

    if (currentCompletion >= job.maxCompletion) return 'completed';
    if (currentCompletion >= job.minCompletion) return 'accomplished';
    if (currentCompletion > 0) return 'active';
    return 'pending';
  }

  /** Check if a job can be executed. */
  static canExecute(job: Job, currentCompletion: number): boolean {
    if (job.status === 'paused' || job.status === 'failed') return false;
    if (currentCompletion >= job.maxCompletion) return false;
    return true;
  }

  /** Check if job's minimum completions have been met. */
  static isAccomplished(job: Job, currentCompletion: number): boolean {
    return currentCompletion >= job.minCompletion;
  }

  /** Check if job has reached maximum completions. */
  static isComplete(job: Job, currentCompletion: number): boolean {
    return currentCompletion >= job.maxCompletion;
  }

  /** Get remaining executions allowed. */
  static remainingExecution(job: Job, currentCompletion: number): number {
    return Math.max(0, job.maxCompletion - currentCompletion);
  }

  /** Get remaining executions needed to reach minimum. */
  static neededForAccomplishment(job: Job, currentCompletion: number): number {
    return Math.max(0, job.minCompletion - currentCompletion);
  }
}
