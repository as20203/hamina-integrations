export const CACHE_FALLBACK_TTL = parseInt(process.env.CACHE_FALLBACK_TTL_MINUTES || '10') * 60; // Convert to seconds
export const REDIS_HEALTH_CHECK_INTERVAL = parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL_MS || '30000');

// Override fallback TTL for all cache configs
export const getCacheConfigWithFallback = (baseTtl: number, keyPrefix: string) => ({
  ttl: baseTtl,
  keyPrefix,
  fallbackTtl: CACHE_FALLBACK_TTL
});