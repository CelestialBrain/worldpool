// ─── Rate Limiter ─────────────────────────────────────────────────────────────
// Token bucket rate limiter for controlling request throughput.

export class RateLimiter {
  private tokenCount: number;
  private lastRefill: number;

  constructor(
    private readonly maxToken: number,
    private readonly refillRate: number,      // tokens per second
  ) {
    this.tokenCount = maxToken;
    this.lastRefill = Date.now();
  }

  /** Wait until a token is available. */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokenCount > 0) {
      this.tokenCount--;
      return;
    }

    // Wait for next token
    const waitMs = (1 / this.refillRate) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokenCount = Math.max(0, this.tokenCount - 1);
  }

  /** Refill tokens based on elapsed time. */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokenCount = Math.min(this.maxToken, this.tokenCount + newTokens);
    this.lastRefill = now;
  }

  /** Get current available tokens. */
  getAvailable(): number {
    this.refill();
    return Math.floor(this.tokenCount);
  }
}
