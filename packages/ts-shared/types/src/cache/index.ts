// Cache related types
import type { Request } from "express";

export interface CacheConfig {
  ttl: number; // seconds
  keyPrefix: string;
  fallbackTtl?: number; // fallback cache duration when Redis is down
}

export interface FallbackCacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  redisAvailable: boolean;
  fallbackCacheSize: number;
  lastRedisCheck: string;
}

export interface CacheMiddlewareOptions {
  config: CacheConfig;
  keyGenerator: (req: Request) => string;
  condition?: (req: Request) => boolean;
}

// Predefined cache configurations
export interface CacheConfigs {
  ORG_INVENTORY: CacheConfig;
  SITE_INVENTORY: CacheConfig;
  CLIENT_STATS: CacheConfig;
  CLIENT_SUMMARY: CacheConfig;
  DEVICE_DETAIL: CacheConfig;
  SITE_SUMMARY: CacheConfig;
}