// ─── Retry Handler ────────────────────────────────────────────────────────────
// Exponential backoff with configurable conditions.

import type { RetryPolicy } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:retry');

type ShouldRetryFn = (error: unknown, attempt: number) => boolean;

export class RetryHandler {
  constructor(private policy: RetryPolicy) {}

  /** Execute a function with retry logic. */
  async execute<T>(
    fn: () => Promise<T>,
    shouldRetry?: ShouldRetryFn,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.policy.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        if (attempt >= this.policy.maxRetries) break;

        const check = shouldRetry ?? (() => true);
        if (!check(err, attempt)) break;

        const delay = Math.min(
          this.policy.initialDelay * Math.pow(this.policy.backoffMultiplier, attempt),
          this.policy.maxDelay,
        );

        log.debug('Retrying', { attempt: attempt + 1, delay_ms: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
