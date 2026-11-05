/**
 * Lightweight in-memory rate limiter for API routes.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Checks whether an action for a given key exceeds the permitted rate limit.
 * 
 * @param key Unique identifier (e.g. `order_limit:${guardianId}`)
 * @param maxRequests Maximum requests allowed within windowMs
 * @param windowMs Time window in milliseconds
 * @returns { isLimited: boolean; remaining: number; resetInMs: number }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000
): { isLimited: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      isLimited: false,
      remaining: maxRequests - 1,
      resetInMs: windowMs,
    };
  }

  if (record.count >= maxRequests) {
    return {
      isLimited: true,
      remaining: 0,
      resetInMs: Math.max(0, record.resetAt - now),
    };
  }

  record.count += 1;
  return {
    isLimited: false,
    remaining: maxRequests - record.count,
    resetInMs: Math.max(0, record.resetAt - now),
  };
}

/**
 * Resets the rate limit counter for a specific key (useful in tests).
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

