import { Clock, SystemClock } from './clock';
import { Decision } from './decision';
import { ClientId } from './identity';
import {
  FixedWindowPolicy,
  validateFixedWindowPolicy,
} from './policy';
import { RateLimiter, SyncRateLimitStore } from './store';

export function calendarWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Globally calendar-aligned fixed-window rate limiter.
 * All work in {@link consume} is synchronous — no await in the critical path.
 */
export class FixedWindowLimiter implements RateLimiter {
  private readonly policy: FixedWindowPolicy;

  constructor(
    policy: FixedWindowPolicy,
    private readonly store: SyncRateLimitStore,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.policy = validateFixedWindowPolicy(policy);
  }

  consume(clientId: ClientId, now?: number): Decision {
    const currentNow = now ?? this.clock.now();
    const { limit, windowMs } = this.policy;
    const windowStart = calendarWindowStart(currentNow, windowMs);
    const resetAt = windowStart + windowMs;

    const result = this.store.tryConsume(clientId, windowStart, limit);

    if (!result.allowed) {
      const retryAfterSec = Math.max(
        0,
        Math.ceil((resetAt - currentNow) / 1000),
      );
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
        retryAfterSec,
      };
    }

    return {
      allowed: true,
      limit,
      remaining: limit - result.count,
      resetAt,
    };
  }
}
