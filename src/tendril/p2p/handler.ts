// ─── P2P Message Handler ──────────────────────────────────────────────────────
// Routes incoming P2P messages to the appropriate handler.
// Adapted from TendrilHive's handlers.ts to use Worldpool conventions.

import { EventEmitter } from 'events';
import { createHmac } from 'node:crypto';
import { MessageType } from '../types.js';
import type { Message, Job, ExecutionResult, PNCounter } from '../types.js';
import { TendrilSwarm } from './swarm.js';
import {
  createMessage,
  type JobBatchRequestPayload,
  type JobBatchResponsePayload,
  type CompletionUpdatePayload,
  type CompletionSyncPayload,
  type ResultSubmitPayload,
  type ResultAckPayload,
  type ResultRequestPayload,
  type ResultResponsePayload,
  type NicknameSyncRequestPayload,
  type NicknameSyncResponsePayload,
  type NicknameAnnouncePayload,
} from './protocol.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:handler');

// ─── Store Interfaces ─────────────────────────────────────────────────────────
// Handler depends on these abstractions, not concrete implementations.
// This keeps the P2P layer decoupled from the storage layer.

export interface JobStoreAdapter {
  get(jobId: string): Promise<Job | null>;
  save(job: Job): Promise<void>;
  getAllSummaries(): Promise<Array<{ id: string; vectorClock: Record<string, number> }>>;
  getAll(limit: number): Promise<Job[]>;
}

export interface ResultStoreAdapter {
  save(result: ExecutionResult): Promise<void>;
  getForJob(jobId: string, limit: number): Promise<ExecutionResult[]>;
}

export interface CompletionCounterAdapter {
  getValue(jobId: string): number;
  merge(jobId: string, remote: PNCounter): void;
  getAllStates(): Record<string, PNCounter>;
}

export interface ConflictResolverAdapter {
  shouldAcceptUpdate(local: Job | null, remote: Job): boolean;
  mergeJobs(local: Job, remote: Job): Job;
}

export interface NicknameStoreAdapter {
  getAllEntries(): Array<{ nodeId: string; nickname: string; assignedAt: number }>;
  mergeEntries(entry: Array<{ nodeId: string; nickname: string; assignedAt: number }>): Promise<number>;
  getEntryCount(): number;
  getMyNickname(): string | null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export class MessageHandler extends EventEmitter {
  constructor(
    private swarm: TendrilSwarm,
    private jobStore: JobStoreAdapter,
    private completionCounter: CompletionCounterAdapter,
    private conflictResolver: ConflictResolverAdapter,
    private nodeId: string,
    private resultStore?: ResultStoreAdapter,
    private nodeSecret?: string,
    private nicknameStore?: NicknameStoreAdapter,
  ) {
    super();
  }

  /** Route an incoming message to its handler. */
  async handle(peerId: string, message: Message): Promise<void> {
    switch (message.type) {
      case MessageType.HELLO:
        await this.handleHello(peerId);
        break;
      case MessageType.HELLO_ACK:
        break; // acknowledged, nothing to do
      case MessageType.JOB_ANNOUNCE:
        await this.handleJobAnnounce(peerId, message);
        break;
      case MessageType.JOB_BATCH_REQUEST:
        await this.handleJobBatchRequest(peerId, message);
        break;
      case MessageType.JOB_BATCH_RESPONSE:
        await this.handleJobBatchResponse(peerId, message);
        break;
      case MessageType.JOB_UPDATE:
        await this.handleJobUpdate(peerId, message);
        break;
      case MessageType.COMPLETION_UPDATE:
        await this.handleCompletionUpdate(message);
        break;
      case MessageType.COMPLETION_SYNC:
        await this.handleCompletionSync(message);
        break;
      case MessageType.RESULT_SUBMIT:
        await this.handleResultSubmit(peerId, message);
        break;
      case MessageType.RESULT_ACK:
        await this.handleResultAck(peerId, message);
        break;
      case MessageType.RESULT_REQUEST:
        await this.handleResultRequest(peerId, message);
        break;
      case MessageType.RESULT_RESPONSE:
        await this.handleResultResponse(peerId, message);
        break;
      case MessageType.NICKNAME_SYNC_REQUEST:
        await this.handleNicknameSyncRequest(peerId);
        break;
      case MessageType.NICKNAME_SYNC_RESPONSE:
        await this.handleNicknameSyncResponse(message);
        break;
      case MessageType.NICKNAME_ANNOUNCE:
        await this.handleNicknameAnnounce(message);
        break;
      default:
        log.warn('Unknown message type', { type: message.type });
    }
  }

  // ─── HELLO ────────────────────────────────────────────────────────────

  private async handleHello(peerId: string): Promise<void> {
    log.info('HELLO received', { peer_id: peerId.slice(0, 12) });

    this.swarm.send(peerId, createMessage(MessageType.HELLO_ACK, this.nodeId, {
      version: '0.1.0',
      nodeId: this.nodeId,
    }));

    await this.requestJobSync(peerId);
    this.requestNicknameSync(peerId);
    this.announceNickname();
  }

  // ─── JOB SYNC ─────────────────────────────────────────────────────────

  private async requestJobSync(peerId: string): Promise<void> {
    const summaries = await this.jobStore.getAllSummaries();
    const payload: JobBatchRequestPayload = { knownJob: summaries };

    this.swarm.send(peerId, createMessage(
      MessageType.JOB_BATCH_REQUEST,
      this.nodeId,
      payload,
    ));
  }

  private async handleJobBatchRequest(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as JobBatchRequestPayload;
    const knownIds = new Set(payload.knownJob.map(j => j.id));

    const allJobs = await this.jobStore.getAll(1000);
    const toSend: Job[] = [];

    for (const job of allJobs) {
      if (!knownIds.has(job.jobId)) {
        toSend.push(job);
      }
      // TODO: compare vector clocks for updates to known jobs
    }

    const responsePayload: JobBatchResponsePayload = { job: toSend };

    this.swarm.send(peerId, createMessage(
      MessageType.JOB_BATCH_RESPONSE,
      this.nodeId,
      responsePayload,
    ));

    // Also send completion counter sync
    const counters = this.completionCounter.getAllStates();
    const syncPayload: CompletionSyncPayload = { counter: counters };

    this.swarm.send(peerId, createMessage(
      MessageType.COMPLETION_SYNC,
      this.nodeId,
      syncPayload,
    ));
  }

  private async handleJobBatchResponse(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as JobBatchResponsePayload;
    if (!payload?.job || !Array.isArray(payload.job)) {
      log.warn('Invalid JOB_BATCH_RESPONSE payload', { peer_id: peerId.slice(0, 12) });
      return;
    }
    log.info('Received jobs from peer', { peer_id: peerId.slice(0, 12), job_count: payload.job.length });

    for (const jobData of payload.job) {
      const job = jobData as Job;
      if (!job.jobId || !job.targetUrl || !job.createdBy) {
        log.warn('Skipping malformed job from peer', { peer_id: peerId.slice(0, 12) });
        continue;
      }
      const existing = await this.jobStore.get(job.jobId);

      if (!existing) {
        await this.jobStore.save(job);
      } else if (this.conflictResolver.shouldAcceptUpdate(existing, job)) {
        const merged = this.conflictResolver.mergeJobs(existing, job);
        await this.jobStore.save(merged);
      }
    }
  }

  // ─── JOB EVENTS ───────────────────────────────────────────────────────

  private async handleJobAnnounce(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as { job: Job };
    const job = payload?.job;
    if (!job?.jobId || !job.targetUrl || !job.createdBy) {
      log.warn('Invalid JOB_ANNOUNCE payload', { peer_id: peerId.slice(0, 12) });
      return;
    }
    const existing = await this.jobStore.get(job.jobId);

    if (!existing) {
      await this.jobStore.save(job);
      log.info('New job from peer', { job_id: job.jobId.slice(0, 8), peer_id: peerId.slice(0, 12) });
    } else if (this.conflictResolver.shouldAcceptUpdate(existing, job)) {
      const merged = this.conflictResolver.mergeJobs(existing, job);
      await this.jobStore.save(merged);
    }
  }

  private async handleJobUpdate(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as { job: Job };
    const job = payload.job;
    const existing = await this.jobStore.get(job.jobId);

    if (existing && this.conflictResolver.shouldAcceptUpdate(existing, job)) {
      const merged = this.conflictResolver.mergeJobs(existing, job);
      await this.jobStore.save(merged);
    }
  }

  // ─── COMPLETION COUNTERS ──────────────────────────────────────────────

  private async handleCompletionUpdate(message: Message): Promise<void> {
    const payload = message.payload as CompletionUpdatePayload;
    const remoteState: PNCounter = {
      P: { [payload.nodeId]: payload.increment > 0 ? payload.increment : 0 },
      N: { [payload.nodeId]: payload.increment < 0 ? -payload.increment : 0 },
    };
    this.completionCounter.merge(payload.jobId, remoteState);
  }

  private async handleCompletionSync(message: Message): Promise<void> {
    const payload = message.payload as CompletionSyncPayload;
    for (const [jobId, counter] of Object.entries(payload.counter)) {
      this.completionCounter.merge(jobId, counter);
    }
  }

  // ─── RESULT SUBMIT / ACK ──────────────────────────────────────────────

  private async handleResultSubmit(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as ResultSubmitPayload;
    if (!payload?.result || !payload.jobId) {
      log.warn('Invalid RESULT_SUBMIT payload', { peer_id: peerId.slice(0, 12) });
      return;
    }
    const result = payload.result as ExecutionResult;

    log.info('Result submission received', {
      job_id: payload.jobId.slice(0, 8),
      peer_id: peerId.slice(0, 12),
    });

    // Verify we own the job
    const job = await this.jobStore.get(payload.jobId);
    if (!job || job.createdBy !== this.nodeId) {
      log.warn('Result for job we do not own', { job_id: payload.jobId.slice(0, 8) });
      return;
    }

    // Store result
    if (this.resultStore) {
      await this.resultStore.save(result);
    }

    // Send ACK
    const timestamp = Date.now();
    const signature = this.generateAckSignature(result.resultId, timestamp);

    const ackPayload: ResultAckPayload = {
      resultId: result.resultId,
      jobId: payload.jobId,
      executorNodeId: result.nodeId,
      signature,
      timestamp,
    };

    this.swarm.send(peerId, createMessage(
      MessageType.RESULT_ACK,
      this.nodeId,
      ackPayload,
    ));

    log.info('RESULT_ACK sent', { result_id: result.resultId.slice(0, 8) });
  }

  private async handleResultAck(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as ResultAckPayload;
    log.info('RESULT_ACK received', { result_id: payload.resultId.slice(0, 8) });

    this.emit('result:ack', {
      resultId: payload.resultId,
      jobId: payload.jobId,
      executorNodeId: payload.executorNodeId,
      signature: payload.signature,
      timestamp: payload.timestamp,
      ownerId: peerId,
    });
  }

  // ─── RESULT REQUEST / RESPONSE ────────────────────────────────────────

  private async handleResultRequest(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as ResultRequestPayload;
    const job = await this.jobStore.get(payload.jobId);

    if (!job) {
      this.sendResultResponse(peerId, payload.jobId, [], 0, false, 'Job not found');
      return;
    }

    if (!job.isPublic && peerId !== job.createdBy) {
      this.sendResultResponse(peerId, payload.jobId, [], 0, false, 'Access denied: private job');
      return;
    }

    if (this.resultStore) {
      const limit = payload.limit || 100;
      const results = await this.resultStore.getForJob(payload.jobId, limit);
      this.sendResultResponse(peerId, payload.jobId, results, results.length, job.isPublic);
    } else {
      this.sendResultResponse(peerId, payload.jobId, [], 0, job.isPublic, 'No result store');
    }
  }

  private async handleResultResponse(peerId: string, message: Message): Promise<void> {
    const payload = message.payload as ResultResponsePayload;
    log.info('Results received', { job_id: payload.jobId.slice(0, 8), count: payload.result.length });

    this.emit('result:response', {
      jobId: payload.jobId,
      result: payload.result,
      totalCount: payload.totalCount,
      isPublic: payload.isPublic,
      error: payload.error,
      ownerId: peerId,
    });
  }

  private sendResultResponse(
    peerId: string,
    jobId: string,
    result: ExecutionResult[],
    totalCount: number,
    isPublic: boolean,
    error?: string,
  ): void {
    const responsePayload: ResultResponsePayload = {
      jobId,
      result,
      totalCount,
      isPublic,
      error,
    };

    this.swarm.send(peerId, createMessage(
      MessageType.RESULT_RESPONSE,
      this.nodeId,
      responsePayload,
    ));
  }

  // ─── NICKNAMES ────────────────────────────────────────────────────────

  private async handleNicknameSyncRequest(peerId: string): Promise<void> {
    if (!this.nicknameStore) return;

    const entries = this.nicknameStore.getAllEntries();
    const responsePayload: NicknameSyncResponsePayload = { entry: entries };

    this.swarm.send(peerId, createMessage(
      MessageType.NICKNAME_SYNC_RESPONSE,
      this.nodeId,
      responsePayload,
    ));
  }

  private async handleNicknameSyncResponse(message: Message): Promise<void> {
    if (!this.nicknameStore) return;

    const payload = message.payload as NicknameSyncResponsePayload;
    const added = await this.nicknameStore.mergeEntries(payload.entry);
    if (added > 0) {
      log.info('Merged nicknames', { added });
    }
  }

  private async handleNicknameAnnounce(message: Message): Promise<void> {
    if (!this.nicknameStore) return;

    const payload = message.payload as NicknameAnnouncePayload;
    const added = await this.nicknameStore.mergeEntries([{
      nodeId: payload.nodeId,
      nickname: payload.nickname,
      assignedAt: Math.floor(Date.now() / 1000),
    }]);
    if (added > 0) {
      log.info('Registered nickname', { nickname: payload.nickname, node_id: payload.nodeId.slice(0, 12) });
    }
  }

  // ─── Public Sync Methods ──────────────────────────────────────────────

  public requestNicknameSync(peerId: string): void {
    if (!this.nicknameStore) return;

    const payload: NicknameSyncRequestPayload = {
      knownCount: this.nicknameStore.getEntryCount(),
    };

    this.swarm.send(peerId, createMessage(
      MessageType.NICKNAME_SYNC_REQUEST,
      this.nodeId,
      payload,
    ));
  }

  public announceNickname(): void {
    if (!this.nicknameStore) return;

    const nickname = this.nicknameStore.getMyNickname();
    if (!nickname) return;

    const payload: NicknameAnnouncePayload = {
      nodeId: this.nodeId,
      nickname,
    };

    this.swarm.broadcast(createMessage(
      MessageType.NICKNAME_ANNOUNCE,
      this.nodeId,
      payload,
    ));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private generateAckSignature(resultId: string, timestamp: number): string {
    const secret = this.nodeSecret || this.nodeId;
    const data = `${resultId}:${timestamp}:ack`;
    return createHmac('sha256', secret).update(data).digest('hex');
  }
}
