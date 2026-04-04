// ─── Tendril Node ─────────────────────────────────────────────────────────────
// Orchestrates all subsystems: swarm, jobs, conflict resolution, execution.
// This is the main entry point for running a Tendril node.

import { TendrilSwarm } from '../p2p/swarm.js';
import { MessageHandler } from '../p2p/handler.js';
import { CompletionCounter } from '../conflict/counter-crdt.js';
import { ConflictResolver } from '../conflict/resolver.js';
import { Executor } from '../execution/executor.js';
import { jobModel } from '../../models/job.js';
import { createSeedJob, createJob as buildJob, type CreateJobInput } from '../job/model.js';
import { JobStateMachine } from '../job/state.js';
import { createMessage } from '../p2p/protocol.js';
import { MessageType } from '../types.js';
import type { Job, ExecutionResult, PNCounter, Message } from '../types.js';
import { loadTendrilConfig, type TendrilConfig } from '../config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:node');

export class TendrilNode {
  private swarm: TendrilSwarm;
  private handler: MessageHandler;
  private completionCounter: CompletionCounter;
  private executor: Executor;
  private config: TendrilConfig;
  private running: boolean = false;
  private executionLoop: NodeJS.Timeout | null = null;

  public readonly nodeId: string;

  constructor(configOverride?: Partial<TendrilConfig>) {
    this.config = { ...loadTendrilConfig(), ...configOverride };

    this.swarm = new TendrilSwarm({ topic: this.config.swarmTopic });
    this.nodeId = this.swarm.nodeId;

    this.completionCounter = new CompletionCounter(this.nodeId);

    this.executor = new Executor({
      requestPerSecond: this.config.requestPerSecond,
      maxConcurrent: this.config.maxConcurrentJob,
    });

    // Build store adapters for the handler
    const jobStoreAdapter = {
      get: async (jobId: string) => jobModel.get(jobId),
      save: async (job: Job) => jobModel.save(job),
      getAllSummaries: async () => jobModel.getAllSummaries(),
      getAll: async (limit: number) => jobModel.getAll(undefined, limit),
    };

    const completionAdapter = {
      getValue: (jobId: string) => this.completionCounter.getValue(jobId),
      merge: (jobId: string, remote: PNCounter) => this.completionCounter.merge(jobId, remote),
      getAllStates: () => this.completionCounter.getAllStates(),
    };

    const conflictAdapter = {
      shouldAcceptUpdate: (local: Job | null, remote: Job) =>
        ConflictResolver.shouldAcceptUpdate(local, remote),
      mergeJobs: (local: Job, remote: Job) =>
        ConflictResolver.mergeJobs(local, remote),
    };

    this.handler = new MessageHandler(
      this.swarm,
      jobStoreAdapter,
      completionAdapter,
      conflictAdapter,
      this.nodeId,
    );

    // Wire swarm messages to handler
    this.swarm.on('message', (peerId: string, message: Message) => {
      this.handler.handle(peerId, message).catch(err => {
        log.error('Handler error', { error: String(err) });
      });
    });

    // Wire result ACK events
    this.handler.on('result:ack', (ack: { resultId: string; jobId: string }) => {
      log.info('Result acknowledged', {
        result_id: ack.resultId.slice(0, 8),
        job_id: ack.jobId.slice(0, 8),
      });
    });

    log.info('Node created', { node_id: this.nodeId.slice(0, 12) });
  }

  /** Start the node — join swarm, ensure seed job, begin execution loop. */
  async start(): Promise<void> {
    if (this.running) return;

    // Ensure seed job exists
    const seedJob = createSeedJob();
    if (!jobModel.get(seedJob.jobId)) {
      jobModel.save(seedJob);
      log.info('Seed job created');
    }

    // Join the swarm
    await this.swarm.join();
    this.running = true;

    // Start execution loop
    this.executionLoop = setInterval(() => {
      this.executeNextJob().catch(err => {
        log.error('Execution loop error', { error: String(err) });
      });
    }, 2000); // check for work every 2s

    log.info('Node started', { node_id: this.nodeId.slice(0, 12) });
  }

  /** Stop the node gracefully. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.executionLoop) {
      clearInterval(this.executionLoop);
      this.executionLoop = null;
    }

    await this.swarm.leave();
    log.info('Node stopped');
  }

  /** Create and announce a new job. */
  createJob(input: CreateJobInput): Job {
    const job = buildJob(input, this.nodeId);

    jobModel.save(job);

    // Announce to swarm
    this.swarm.broadcast(createMessage(
      MessageType.JOB_ANNOUNCE,
      this.nodeId,
      { job },
    ));

    log.info('Job created and announced', { job_id: job.jobId.slice(0, 8) });
    return job;
  }

  /** Execute the next available job. */
  private async executeNextJob(): Promise<void> {
    if (!this.executor.hasCapacity()) return;

    const jobs = jobModel.getExecutable();
    if (jobs.length === 0) return;

    // Find a job we haven't exceeded limits for
    for (const job of jobs) {
      const completions = this.completionCounter.getValue(job.jobId);
      if (!JobStateMachine.canExecute(job, completions)) continue;

      // Execute
      const result = await this.executor.execute(job, this.nodeId);

      if (result.success) {
        // Increment completion counter
        this.completionCounter.increment(job.jobId);
        const newCount = this.completionCounter.getValue(job.jobId);

        // Update status
        const newStatus = JobStateMachine.evaluateStatus(job, newCount);
        if (newStatus !== job.status) {
          jobModel.updateStatus(job.jobId, newStatus);
        }

        // Broadcast completion update
        this.swarm.broadcast(createMessage(
          MessageType.COMPLETION_UPDATE,
          this.nodeId,
          {
            jobId: job.jobId,
            nodeId: this.nodeId,
            increment: 1,
            timestamp: Date.now(),
          },
        ));

        // If job is owned by someone else, submit result for ACK
        if (job.createdBy !== this.nodeId) {
          this.submitResultToOwner(job, result);
        }
      }

      break; // one job per tick
    }
  }

  /** Submit execution result to the job owner for ACK + scraps. */
  private submitResultToOwner(job: Job, result: ExecutionResult): void {
    // Broadcast the result submission — any peer might be the owner or relay
    this.swarm.broadcast(createMessage(
      MessageType.RESULT_SUBMIT,
      this.nodeId,
      {
        result,
        jobId: job.jobId,
        expectedReward: job.multiplier,
      },
    ));
  }

  /** Get node status. */
  getStatus(): {
    nodeId: string;
    running: boolean;
    peerCount: number;
    jobCount: Record<string, number>;
    topic: string;
  } {
    return {
      nodeId: this.nodeId,
      running: this.running,
      peerCount: this.swarm.getPeerCount(),
      jobCount: jobModel.countByStatus(),
      topic: this.config.swarmTopic,
    };
  }

  /** Get the swarm instance (for SDK access). */
  getSwarm(): TendrilSwarm {
    return this.swarm;
  }

  /** Get the completion counter (for SDK access). */
  getCompletionCounter(): CompletionCounter {
    return this.completionCounter;
  }
}
