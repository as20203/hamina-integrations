import { queueMistRequest } from './mist-queue.js';
import type { 
  RateLimitConfig, 
  QueuedResponse, 
  ImmediateResponse, 
  RateLimitedResponse 
} from '@repo/types';

class MistRateLimiter {
  private requestTimes: number[] = [];
  private activeRequests = 0;
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxRequestsPerMinute: 300, // Mist API limit
      maxConcurrentRequests: 10,
      retryAfterMs: 200,
      ...config,
    };
  }

  private cleanupOldRequests(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
  }

  private isRateLimited(): boolean {
    this.cleanupOldRequests();
    
    // Check if we're at the request limit
    if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
      return true;
    }
    
    // Check if we're at the concurrent request limit
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      return true;
    }
    
    return false;
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
    if (this.isRateLimited()) {
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
      this.activeRequests++;
      this.requestTimes.push(Date.now());
      
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
    return {
      requestsInLastMinute: this.requestTimes.length,
      activeRequests: this.activeRequests,
      maxRequestsPerMinute: this.config.maxRequestsPerMinute,
      maxConcurrentRequests: this.config.maxConcurrentRequests,
    };
  }
}

export const mistRateLimiter = new MistRateLimiter();