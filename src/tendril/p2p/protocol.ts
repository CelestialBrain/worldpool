// ─── P2P Protocol ─────────────────────────────────────────────────────────────
// MsgPack-based message encoding/decoding and typed payload definitions.

import msgpack from 'msgpack-lite';
import { randomUUID } from 'node:crypto';
import type { Message, MessageType, VectorClock, PNCounter, ExecutionResult } from '../types.js';

// ─── Encode / Decode ──────────────────────────────────────────────────────────

export function encode(msg: Message): Buffer {
  return msgpack.encode(msg);
}

export function decode(data: Buffer): Message {
  return msgpack.decode(data) as Message;
}

// ─── Message Factory ──────────────────────────────────────────────────────────

export function createMessage(
  type: MessageType,
  senderId: string,
  payload: unknown,
): Message {
  return {
    type,
    id: randomUUID(),
    timestamp: Date.now(),
    senderId,
    payload,
  };
}

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface HelloPayload {
  version: string;
  nodeId: string;
}

export interface JobAnnouncePayload {
  job: unknown;
}

export interface JobBatchRequestPayload {
  knownJob: Array<{
    id: string;
    vectorClock: Record<string, number>;
  }>;
}

export interface JobBatchResponsePayload {
  job: unknown[];
}

export interface JobUpdatePayload {
  job: unknown;
}

export interface CompletionUpdatePayload {
  jobId: string;
  nodeId: string;
  increment: number;
  timestamp: number;
}

export interface CompletionSyncPayload {
  counter: Record<string, PNCounter>;
}

export interface ResultAnnouncePayload {
  result: unknown;
}

export interface ResultSubmitPayload {
  result: unknown;
  jobId: string;
  expectedReward: number;
}

export interface ResultAckPayload {
  resultId: string;
  jobId: string;
  executorNodeId: string;
  signature: string;
  timestamp: number;
}

export interface ResultRequestPayload {
  jobId: string;
  requesterId: string;
  offset?: number;
  limit?: number;
}

export interface ResultResponsePayload {
  jobId: string;
  result: unknown[];
  totalCount: number;
  isPublic: boolean;
  error?: string;
}

export interface NicknameSyncRequestPayload {
  knownCount: number;
}

export interface NicknameSyncResponsePayload {
  entry: Array<{
    nodeId: string;
    nickname: string;
    assignedAt: number;
  }>;
}

export interface NicknameAnnouncePayload {
  nodeId: string;
  nickname: string;
}
