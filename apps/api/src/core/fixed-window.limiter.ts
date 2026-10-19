import { Clock, SystemClock } from './clock';
import { Decision } from './decision';
import { fixedWindowDecision } from './fixed-window.decision';
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

    return fixedWindowDecision({
      allowed: result.allowed,
      count: result.count,
      limit,
      now: currentNow,
      resetAt,
    });
  }
}
