import { queueMistRequest } from './mist-queue.js';
import { reserveMistRateBudget } from './mist-rate-budget.js';
import type {
  RateLimitConfig,
  RateLimitedResponse,
} from "@repo/types";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parseEnvInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

class MistRateLimiter {
  private requestTimes: number[] = [];
  private requestTimesFixedHour: number[] = [];
  private activeRequests = 0;
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxRequestsPerMinute: parseEnvInt(process.env.MIST_MAX_REQUESTS_PER_MINUTE, 300),
      maxRequestsPerHour: parseEnvInt(process.env.MIST_MAX_REQUESTS_PER_HOUR, 5000),
      maxConcurrentRequests: 10,
      retryAfterMs: 200,
      ...config,
    };
  }

  private cleanupOldRequests(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimes = this.requestTimes.filter((time) => time > oneMinuteAgo);
  }

  private cleanupFixedHourRequests(): void {
    const now = Date.now();
    const startOfHour = now - (now % 3_600_000);
    this.requestTimesFixedHour = this.requestTimesFixedHour.filter((t) => t >= startOfHour);
  }

  private inMemoryIsRateLimited(): boolean {
    this.cleanupOldRequests();
    this.cleanupFixedHourRequests();

    if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
      return true;
    }

    if (this.requestTimesFixedHour.length >= this.config.maxRequestsPerHour) {
      return true;
    }

    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      return true;
    }

    return false;
  }

  private async reserveSharedBudget(): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
    const reserved = await reserveMistRateBudget({
      maxRequestsPerMinute: this.config.maxRequestsPerMinute,
      maxRequestsPerHour: this.config.maxRequestsPerHour,
    });
    if (!reserved.allowed) {
      return { ok: false, retryAfterMs: reserved.retryAfterMs };
    }
    // Keep local stats for /queue/status style visibility.
    const now = Date.now();
    this.requestTimes.push(now);
    this.requestTimesFixedHour.push(now);
    return { ok: true };
  }

  /**
   * Server-side Mist calls (mistFetch): wait for budget, then run without BullMQ/SSE.
   * Each successful wait consumes one minute + one hour slot and a concurrency slot for the duration of fetcher.
   */
  async runWhenAllowed<T>(fetcher: () => Promise<T>): Promise<T> {
    for (;;) {
      this.cleanupOldRequests();
      this.cleanupFixedHourRequests();

      if (this.activeRequests >= this.config.maxConcurrentRequests) {
        await sleep(this.config.retryAfterMs);
        continue;
      }
      const reserved = await this.reserveSharedBudget();
      if (!reserved.ok) {
        await sleep(Math.max(this.config.retryAfterMs, reserved.retryAfterMs));
        continue;
      }
      this.activeRequests += 1;
      try {
        return await fetcher();
      } finally {
        this.activeRequests -= 1;
      }
    }
  }

  async executeRequest<T>(
    fetcher: () => Promise<T>,
    options: {
      clientId: string;
      endpoint: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      headers?: Record<string, string>;
      body?: unknown;
    }
  ): Promise<RateLimitedResponse<T>> {
    if (this.activeRequests >= this.config.maxConcurrentRequests || this.inMemoryIsRateLimited()) {
      // Queue the request
      console.log(`[rate-limiter] Rate limit hit, queueing request to ${options.endpoint}`);
      const { requestId, jobId } = await queueMistRequest(options.endpoint, options);
      
      return {
        isQueued: true,
        requestId,
        jobId,
      };
    }

    // Execute immediately
    try {
      const reserved = await this.reserveSharedBudget();
      if (!reserved.ok) {
        const { requestId, jobId } = await queueMistRequest(options.endpoint, options);
        return {
          isQueued: true,
          requestId,
          jobId,
        };
      }
      this.activeRequests++;

      const data = await fetcher();
      
      return {
        isQueued: false,
        data,
      };
    } catch (error) {
      // Check if it's a 429 (rate limit) error
      if (error instanceof Error && error.message.includes('429')) {
        console.log(`[rate-limiter] Received 429, queueing request to ${options.endpoint}`);
        const { requestId, jobId } = await queueMistRequest(options.endpoint, options);
        
        return {
          isQueued: true,
          requestId,
          jobId,
        };
      }
      
      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  getStats() {
    this.cleanupOldRequests();
    this.cleanupFixedHourRequests();
    return {
      requestsInLastMinute: this.requestTimes.length,
      requestsInCurrentHourWindow: this.requestTimesFixedHour.length,
      activeRequests: this.activeRequests,
      maxRequestsPerMinute: this.config.maxRequestsPerMinute,
      maxRequestsPerHour: this.config.maxRequestsPerHour,
      maxConcurrentRequests: this.config.maxConcurrentRequests,
    };
  }
}

export const mistRateLimiter = new MistRateLimiter();