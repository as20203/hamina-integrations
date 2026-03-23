import { redis } from "../cache/redis-client.js";

type ReserveBudgetOptions = {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
};

type ReserveBudgetResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

const RATE_KEY_PREFIX = "mist:ratelimit";

const msUntilNextMinuteBoundary = (now: number): number => 60_000 - (now % 60_000);
const msUntilNextHourBoundary = (now: number): number => 3_600_000 - (now % 3_600_000);

const reserveBucket = async (
  key: string,
  limit: number,
  ttlMs: number
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> => {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, Math.max(1000, ttlMs + 1000));
  }
  if (count > limit) {
    await redis.decr(key);
    return { ok: false, retryAfterMs: Math.max(250, ttlMs) };
  }
  return { ok: true };
};

const reserveMistRateBudget = async (opts: ReserveBudgetOptions): Promise<ReserveBudgetResult> => {
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60_000);
  const hourBucket = Math.floor(now / 3_600_000);
  const minuteTtlMs = msUntilNextMinuteBoundary(now);
  const hourTtlMs = msUntilNextHourBoundary(now);
  const minuteKey = `${RATE_KEY_PREFIX}:minute:${minuteBucket}`;
  const hourKey = `${RATE_KEY_PREFIX}:hour:${hourBucket}`;

  try {
    const minute = await reserveBucket(minuteKey, opts.maxRequestsPerMinute, minuteTtlMs);
    if (!minute.ok) {
      return { allowed: false, retryAfterMs: minute.retryAfterMs };
    }

    const hour = await reserveBucket(hourKey, opts.maxRequestsPerHour, hourTtlMs);
    if (!hour.ok) {
      // Roll back minute reservation if hour reservation failed.
      await redis.decr(minuteKey);
      return { allowed: false, retryAfterMs: hour.retryAfterMs };
    }

    return { allowed: true };
  } catch {
    // On Redis failure, fail open so Mist calls still work (same as existing cache fallbacks philosophy).
    return { allowed: true };
  }
};

export { reserveMistRateBudget };

