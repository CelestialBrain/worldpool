// ─── Tendril SDK ──────────────────────────────────────────────────────────────
// The user-facing class. Install, connect, scrape.
//
// Usage:
//   import { Tendril } from 'worldpool-tendril';
//   const t = new Tendril({ topic: 'worldpool' });
//   await t.connect();
//   const html = await t.get('https://example.com');
//   await t.disconnect();

import { TendrilNode } from '../core/node.js';
import { ProxyPool, type ProxyFilter } from './proxy-pool.js';
import { createJob } from '../job/model.js';
import { createMessage } from '../p2p/protocol.js';
import { MessageType, PUBLIC_TOPIC } from '../types.js';
import type { Job, ExecutionResult } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:sdk');

// ─── SDK Types ────────────────────────────────────────────────────────────────

export interface TendrilOption {
  topic?: string;       // default: 'worldpool'
  timeout?: number;     // default: 30000
  maxRetry?: number;    // default: 3
}

export interface RequestOption {
  headers?: Record<string, string>;
  body?: string | object;
  proxy?: string;       // proxy URL to route through
  timeout?: number;     // override default
}

export interface TendrilResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  nodeId: string;
  latencyMs: number;
}

export interface TendrilRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;
  proxy?: string;
}

export interface TendrilStatus {
  connected: boolean;
  nodeId: string;
  peerCount: number;
  topic: string;
}

// ─── Auth Header Detection ────────────────────────────────────────────────────

const AUTH_HEADERS = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'x-csrf-token',
];

function hasAuthHeader(headers?: Record<string, string>): boolean {
  if (!headers) return false;
  return Object.keys(headers).some(h => AUTH_HEADERS.includes(h.toLowerCase()));
}

// ─── SDK Class ────────────────────────────────────────────────────────────────

export class Tendril {
  private node: TendrilNode | null = null;
  private proxyPool: ProxyPool;
  private topic: string;
  private defaultTimeout: number;
  private maxRetry: number;
  private connected = false;

  constructor(opts?: TendrilOption) {
    this.topic = opts?.topic ?? PUBLIC_TOPIC;
    this.defaultTimeout = opts?.timeout ?? 30_000;
    this.maxRetry = opts?.maxRetry ?? 3;
    this.proxyPool = new ProxyPool();
  }

  /** Connect to the Tendril swarm. */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.node = new TendrilNode({
      enabled: true,
      swarmTopic: this.topic,
    });

    await this.node.start();
    this.connected = true;

    log.info('SDK connected', { topic: this.topic, node_id: this.node.nodeId.slice(0, 12) });
  }

  /** Disconnect from the swarm. */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.node) return;

    await this.node.stop();
    this.node = null;
    this.connected = false;

    log.info('SDK disconnected');
  }

  // ─── Core Scraping Methods ──────────────────────────────────────────

  /** GET request through the swarm. */
  async get(url: string, opts?: RequestOption): Promise<TendrilResponse> {
    return this.request('GET', url, opts);
  }

  /** POST request through the swarm. */
  async post(url: string, opts?: RequestOption): Promise<TendrilResponse> {
    return this.request('POST', url, opts);
  }

  /** Execute an HTTP request through the Tendril network. */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    url: string,
    opts?: RequestOption,
  ): Promise<TendrilResponse> {
    if (!this.node) throw new Error('Not connected. Call connect() first.');

    // Auth guard — block secrets on public topic
    if (this.isPublicTopic() && hasAuthHeader(opts?.headers)) {
      throw new Error(
        `Cannot send authentication headers on public topic "${PUBLIC_TOPIC}". ` +
        `Use a private topic: new Tendril({ topic: "your-private-topic" })`,
      );
    }

    const peerCount = this.node.getSwarm().getPeerCount();

    // If we have peers, submit as a job for distributed execution
    if (peerCount > 0) {
      return this.executeDistributed(method, url, opts);
    }

    // Fallback: execute locally
    return this.executeLocal(method, url, opts);
  }

  /** Execute multiple requests in parallel across the swarm. */
  async batch(requests: TendrilRequest[]): Promise<TendrilResponse[]> {
    return Promise.all(
      requests.map(r =>
        this.request(r.method ?? 'GET', r.url, {
          headers: r.headers,
          body: r.body,
          proxy: r.proxy,
        }),
      ),
    );
  }

  // ─── Proxy Access ───────────────────────────────────────────────────

  /** Get a random proxy from Worldpool's pool. */
  async getProxy(filter?: ProxyFilter): Promise<string> {
    const proxy = await this.proxyPool.getRandom(filter);
    if (!proxy) throw new Error('No proxies available matching filter');
    return proxy;
  }

  /** Get all proxies matching filter. */
  async getProxies(filter?: ProxyFilter): Promise<string[]> {
    return this.proxyPool.getAll(filter);
  }

  // ─── Network Info ───────────────────────────────────────────────────

  /** Get connected peer count. */
  getNodeCount(): number {
    return this.node?.getSwarm().getPeerCount() ?? 0;
  }

  /** Get current status. */
  getStatus(): TendrilStatus {
    return {
      connected: this.connected,
      nodeId: this.node?.nodeId ?? '',
      peerCount: this.getNodeCount(),
      topic: this.topic,
    };
  }

  // ─── Private Methods ────────────────────────────────────────────────

  private isPublicTopic(): boolean {
    return this.topic === PUBLIC_TOPIC;
  }

  /** Publish a job to the swarm and wait for a result. */
  private async executeDistributed(
    method: string,
    url: string,
    opts?: RequestOption,
  ): Promise<TendrilResponse> {
    if (!this.node) throw new Error('Not connected');

    const start = Date.now();
    const headerJson = opts?.headers ? JSON.stringify(opts.headers) : undefined;
    const bodyJson = opts?.body
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : undefined;

    // Create and announce the job
    const job = createJob({
      targetUrl: url,
      httpMethod: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      headerJson,
      bodyJson,
      proxyUrl: opts?.proxy,
      minCompletion: 1,
      maxCompletion: 1,
      limitPerNode: 1,
      timeoutMs: opts?.timeout ?? this.defaultTimeout,
      multiplier: 1,
      isPublic: false,
    }, this.node.nodeId);

    const { jobModel } = await import('../../models/job.js');
    jobModel.save(job);

    this.node.getSwarm().broadcast(createMessage(
      MessageType.JOB_ANNOUNCE,
      this.node.nodeId,
      { job },
    ));

    // Wait for a result (via result:response event)
    const timeout = opts?.timeout ?? this.defaultTimeout;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeout}ms`));
      }, timeout);

      // Listen for result responses
      const handler = this.node!.getSwarm();
      const checkResult = (peerId: string, msg: any) => {
        if (msg.type === MessageType.RESULT_ANNOUNCE || msg.type === MessageType.RESULT_RESPONSE) {
          const payload = msg.payload as any;
          if (payload.jobId === job.jobId || (payload.result && (payload.result as any).jobId === job.jobId)) {
            clearTimeout(timer);
            handler.removeListener('message', checkResult);

            const result = (payload.result ?? payload.result?.[0]) as ExecutionResult;
            resolve({
              status: result?.statusCode ?? 0,
              headers: result?.responseHeaders ?? {},
              body: result?.responseBody ?? '',
              nodeId: result?.nodeId ?? peerId,
              latencyMs: Date.now() - start,
            });
          }
        }
      };

      handler.on('message', checkResult);
    });
  }

  /** Execute locally (fallback when no peers available). */
  private async executeLocal(
    method: string,
    url: string,
    opts?: RequestOption,
  ): Promise<TendrilResponse> {
    const { Executor } = await import('../execution/executor.js');
    const executor = new Executor({ requestPerSecond: 10, maxConcurrent: 5 });

    const job: Job = {
      jobId: 'local-' + Date.now(),
      createdBy: 'local',
      createdAt: Math.floor(Date.now() / 1000),
      targetUrl: url,
      httpMethod: method as any,
      headerJson: opts?.headers ? JSON.stringify(opts.headers) : undefined,
      bodyJson: opts?.body
        ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
        : undefined,
      proxyUrl: opts?.proxy,
      minCompletion: 1,
      maxCompletion: 1,
      limitPerNode: 1,
      status: 'pending',
      timeoutMs: opts?.timeout ?? this.defaultTimeout,
      retryMax: this.maxRetry,
      retryDelayMs: 1000,
      retryMaxDelayMs: 30000,
      retryBackoff: 2,
      multiplier: 1,
      isSeed: false,
      isPublic: false,
      vectorClock: {},
    };

    const start = Date.now();
    const result = await executor.execute(job, 'local');

    if (!result.success) {
      throw new Error(`Request failed: ${result.error}`);
    }

    return {
      status: result.statusCode ?? 0,
      headers: result.responseHeaders ?? {},
      body: result.responseBody ?? '',
      nodeId: 'local',
      latencyMs: Date.now() - start,
    };
  }
}
