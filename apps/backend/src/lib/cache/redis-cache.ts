import { redis } from './redis-client.js';
import { CACHE_FALLBACK_TTL, REDIS_HEALTH_CHECK_INTERVAL } from './cache-config.js';
import type { CacheConfig, FallbackCacheItem, CacheStats } from '@repo/types';

export const CACHE_CONFIGS = {
  ORG_INVENTORY: { ttl: 900, keyPrefix: 'mist:inventory:org', fallbackTtl: CACHE_FALLBACK_TTL }, // 15 min / 10 min fallback
  SITE_INVENTORY: { ttl: 300, keyPrefix: 'mist:inventory:site', fallbackTtl: CACHE_FALLBACK_TTL }, // 5 min / 10 min fallback
  CLIENT_STATS: { ttl: 120, keyPrefix: 'mist:clients:site', fallbackTtl: CACHE_FALLBACK_TTL }, // 2 min / 10 min fallback
  CLIENT_SUMMARY: { ttl: 30, keyPrefix: 'mist:clients:summary', fallbackTtl: CACHE_FALLBACK_TTL }, // 30 sec / 10 min fallback
  DEVICE_DETAIL: { ttl: 300, keyPrefix: 'mist:device', fallbackTtl: CACHE_FALLBACK_TTL }, // 5 min / 10 min fallback
  SITE_SUMMARY: { ttl: 180, keyPrefix: 'mist:site:summary', fallbackTtl: CACHE_FALLBACK_TTL }, // 3 min / 10 min fallback
} as const;

// FallbackCacheItem is now imported from @repo/types

class RedisCache {
  private fallbackCache = new Map<string, FallbackCacheItem<unknown>>();
  private redisAvailable = true;
  private lastRedisCheck = 0;

  private async checkRedisHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastRedisCheck < REDIS_HEALTH_CHECK_INTERVAL) {
      return this.redisAvailable;
    }

    try {
      await redis.ping();
      this.redisAvailable = true;
      this.lastRedisCheck = now;
      return true;
    } catch (error) {
      console.warn('[hamina-backend] Redis health check failed:', error);
      this.redisAvailable = false;
      this.lastRedisCheck = now;
      return false;
    }
  }

  private cleanupFallbackCache(): void {
    const now = Date.now();
    for (const [key, item] of this.fallbackCache.entries()) {
      if (now - item.timestamp > item.ttl * 1000) {
        this.fallbackCache.delete(key);
      }
    }
  }

  async get<T>(key: string, config: CacheConfig): Promise<T | null> {
    const fullKey = `${config.keyPrefix}:${key}`;
    
    // Try Redis first if available
    if (await this.checkRedisHealth()) {
      try {
        const cached = await redis.get(fullKey);
        if (cached) {
          return JSON.parse(cached) as T;
        }
      } catch (error) {
        console.warn('[hamina-backend] Redis get error:', error);
        this.redisAvailable = false;
      }
    }

    // Fallback to in-memory cache
    this.cleanupFallbackCache();
    const fallbackItem = this.fallbackCache.get(fullKey);
    if (fallbackItem) {
      const now = Date.now();
      if (now - fallbackItem.timestamp < fallbackItem.ttl * 1000) {
        return fallbackItem.data as T;
      } else {
        this.fallbackCache.delete(fullKey);
      }
    }

    return null;
  }

  async set<T>(key: string, value: T, config: CacheConfig): Promise<void> {
    const fullKey = `${config.keyPrefix}:${key}`;
    const fallbackTtl = config.fallbackTtl || CACHE_FALLBACK_TTL;

    // Try Redis first if available
    if (await this.checkRedisHealth()) {
      try {
        await redis.setex(fullKey, config.ttl, JSON.stringify(value));
      } catch (error) {
        console.warn('[hamina-backend] Redis set error:', error);
        this.redisAvailable = false;
      }
    }

    // Always store in fallback cache as backup
    this.fallbackCache.set(fullKey, {
      data: value,
      timestamp: Date.now(),
      ttl: fallbackTtl
    });
  }

  async del(key: string, config: CacheConfig): Promise<void> {
    const fullKey = `${config.keyPrefix}:${key}`;
    
    // Try Redis first
    if (await this.checkRedisHealth()) {
      try {
        await redis.del(fullKey);
      } catch (error) {
        console.warn('[hamina-backend] Redis del error:', error);
      }
    }

    // Remove from fallback cache
    this.fallbackCache.delete(fullKey);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Try Redis first
    if (await this.checkRedisHealth()) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (error) {
        console.warn('[hamina-backend] Redis pattern invalidation error:', error);
      }
    }

    // Clear matching keys from fallback cache
    for (const key of this.fallbackCache.keys()) {
      if (key.includes(pattern.replace('*', ''))) {
        this.fallbackCache.delete(key);
      }
    }
  }

  // Enhanced cache-aside pattern with fallback
  async getOrSet<T>(
    key: string,
    config: CacheConfig,
    fetcher: () => Promise<T>
  ): Promise<T> {
    let cached = await this.get<T>(key, config);
    
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetcher();
    await this.set(key, fresh, config);
    return fresh;
  }

  // Get cache statistics for monitoring
  getCacheStats() {
    return {
      redisAvailable: this.redisAvailable,
      fallbackCacheSize: this.fallbackCache.size,
      lastRedisCheck: new Date(this.lastRedisCheck).toISOString()
    };
  }
}

export const cache = new RedisCache();