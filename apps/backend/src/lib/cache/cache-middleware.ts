import type { Request, Response, NextFunction } from "express";
import { cache } from "./redis-cache.js";
import type { CacheConfig, CacheMiddlewareOptions } from "@repo/types";

const queryToUrlSearchParams = (query: Request["query"]): URLSearchParams => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v != null) params.append(key, String(v));
      }
    } else {
      params.append(key, String(value));
    }
  }
  return params;
};

export const cacheMiddleware = (options: CacheMiddlewareOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (options.condition && !options.condition(req)) {
      return next();
    }

    const cacheKey = options.keyGenerator(req);
    const cached = await cache.get(cacheKey, options.config);

    if (cached) {
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to cache response
    res.json = function (data: unknown) {
      const payload = data as { ok?: boolean };
      if (res.statusCode === 200 && payload.ok === true) {
        cache.set(cacheKey, data, options.config).catch(console.warn);
      }
      return originalJson(data);
    };

    next();
  };
};

// Predefined cache middleware for common patterns
export const inventoryCacheMiddleware = cacheMiddleware({
  config: { ttl: 900, keyPrefix: "mist:inventory:org", fallbackTtl: 600 },
  keyGenerator: (req: Request) => {
    const params = queryToUrlSearchParams(req.query);
    return `${req.path}:${params.toString()}`;
  },
  condition: (req: Request) => req.method === "GET",
});

export const siteCacheMiddleware = (config: CacheConfig) =>
  cacheMiddleware({
    config,
    keyGenerator: (req: Request) => {
      const siteId = req.params.siteId;
      const params = queryToUrlSearchParams(req.query);
      return `${siteId}:${params.toString()}`;
    },
    condition: (req: Request) => req.method === "GET",
  });