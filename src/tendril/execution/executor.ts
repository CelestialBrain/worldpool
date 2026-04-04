// ─── Job Executor ─────────────────────────────────────────────────────────────
// Executes Tendril jobs — makes HTTP requests with optional proxy routing.
// Rate-limited with retry support and AbortController timeouts.

import { randomUUID } from 'node:crypto';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { Agent } from 'node:http';
import axios from 'axios';
import type { Job, ExecutionResult, RetryPolicy } from '../types.js';
import { DEFAULT_RETRY_POLICY } from '../types.js';
import { RateLimiter } from './rate-limiter.js';
import { RetryHandler } from './retry.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:executor');

interface ExecutorConfig {
  requestPerSecond: number;
  maxConcurrent: number;
}

/** Build HTTP/SOCKS proxy agents from a proxy URL. */
function buildProxyAgent(proxyUrl: string): { httpAgent: Agent; httpsAgent: Agent } {
  if (proxyUrl.startsWith('socks4:') || proxyUrl.startsWith('socks5:')) {
    const agent = new SocksProxyAgent(proxyUrl) as unknown as Agent;
    return { httpAgent: agent, httpsAgent: agent };
  }
  return {
    httpAgent: new HttpProxyAgent(proxyUrl) as unknown as Agent,
    httpsAgent: new HttpsProxyAgent(proxyUrl) as unknown as Agent,
  };
}

export class Executor {
  private limiter: RateLimiter;
  private active: number = 0;
  private maxConcurrent: number;

  constructor(config: ExecutorConfig) {
    this.limiter = new RateLimiter(config.requestPerSecond, config.requestPerSecond);
    this.maxConcurrent = config.maxConcurrent;
  }

  /** Execute a job and return the result. */
  async execute(job: Job, nodeId: string, workerId?: string): Promise<ExecutionResult> {
    const resultId = randomUUID();
    const start = Date.now();

    // Wait for rate limit
    await this.limiter.acquire();

    // Build retry handler from job's retry config
    const retryPolicy: RetryPolicy = {
      maxRetries: job.retryMax,
      initialDelay: job.retryDelayMs,
      maxDelay: job.retryMaxDelayMs,
      backoffMultiplier: job.retryBackoff,
    };
    const retrier = new RetryHandler(retryPolicy);

    try {
      this.active++;

      const result = await retrier.execute(async () => {
        // Parse headers
        const headers: Record<string, string> = job.headerJson
          ? JSON.parse(job.headerJson)
          : {};

        // Parse body
        let body: unknown = undefined;
        if (job.bodyJson) {
          try { body = JSON.parse(job.bodyJson); }
          catch { body = job.bodyJson; }
        }

        // Build request config
        const requestConfig: Record<string, unknown> = {
          method: job.httpMethod,
          url: job.targetUrl,
          headers,
          data: body,
          timeout: job.timeoutMs,
          validateStatus: () => true,   // don't throw on non-2xx
          maxRedirects: 5,
          responseType: 'text',
        };

        // Optional proxy routing
        if (job.proxyUrl) {
          const { httpAgent, httpsAgent } = buildProxyAgent(job.proxyUrl);
          requestConfig.httpAgent = httpAgent;
          requestConfig.httpsAgent = httpsAgent;
        }

        const response = await axios(requestConfig as any);

        const responseBody = typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);

        return {
          statusCode: response.status,
          responseBody: responseBody.slice(0, 50_000), // cap at 50KB
          responseHeaders: response.headers as Record<string, string>,
        };
      });

      const durationMs = Date.now() - start;

      log.info('Job executed', {
        job_id: job.jobId.slice(0, 8),
        status: result.statusCode,
        duration_ms: durationMs,
      });

      return {
        resultId,
        jobId: job.jobId,
        nodeId,
        timestamp: Math.floor(Date.now() / 1000),
        success: true,
        statusCode: result.statusCode,
        responseBody: result.responseBody,
        responseHeaders: result.responseHeaders,
        durationMs,
        targetUrl: job.targetUrl,
        workerId,
      };
    } catch (err) {
      const durationMs = Date.now() - start;

      log.error('Job execution failed', {
        job_id: job.jobId.slice(0, 8),
        error: String(err),
        duration_ms: durationMs,
      });

      return {
        resultId,
        jobId: job.jobId,
        nodeId,
        timestamp: Math.floor(Date.now() / 1000),
        success: false,
        error: String(err),
        durationMs,
        targetUrl: job.targetUrl,
        workerId,
      };
    } finally {
      this.active--;
    }
  }

  /** Get number of currently executing jobs. */
  getActiveCount(): number {
    return this.active;
  }

  /** Check if executor has capacity for another job. */
  hasCapacity(): boolean {
    return this.active < this.maxConcurrent;
  }
}
