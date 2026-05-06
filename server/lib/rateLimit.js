/**
 * Sliding-window rate limiter. Each key tracks an array of hit timestamps;
 * requests outside the window are evicted on every check.
 * Empty keys are pruned automatically to prevent unbounded memory growth.
 */
export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    /** @type {Map<string, number[]>} */
    this.hits = new Map()
  }

  /**
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
  check(key) {
    const now = Date.now()
    const cutoff = now - this.windowMs
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff)

    if (timestamps.length >= this.maxRequests) {
      this.hits.set(key, timestamps)
      return { allowed: false, remaining: 0, resetAt: timestamps[0] + this.windowMs }
    }

    timestamps.push(now)
    this.hits.set(key, timestamps)
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetAt: now + this.windowMs,
    }
  }

  /** Remove tracking for a key (call on socket disconnect to prevent memory leak). */
  remove(key) {
    this.hits.delete(key)
  }
}
