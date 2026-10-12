import { Clock, SystemClock } from './clock';
import { Decision } from './decision';
import { ClientId } from './identity';
import {
  SlidingWindowPolicy,
  validateSlidingWindowPolicy,
} from './policy';
import { RateLimiter } from './store';
import { SlidingWindowStore } from './sliding-window.store';

/**
 * Weighted sliding-window counter rate limiter.
 * estimate = prevCount * (1 - elapsed/windowMs) + currCount
 * Allow iff estimate < limit (pre-increment).
 */
export class SlidingWindowLimiter implements RateLimiter {
  private readonly policy: SlidingWindowPolicy;

  constructor(
    policy: SlidingWindowPolicy,
    private readonly store: SlidingWindowStore,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.policy = validateSlidingWindowPolicy(policy);
  }

  consume(clientId: ClientId, now?: number): Decision {
    const currentNow = now ?? this.clock.now();
    const { limit, windowMs } = this.policy;
    const C = Math.floor(currentNow / windowMs) * windowMs;
    const nextBoundary = C + windowMs;

    const result = this.store.tryConsume(
      clientId,
      currentNow,
      windowMs,
      limit,
    );

    if (!result.allowed) {
      const resetAt = this.computeResetAt(
        currentNow,
        C,
        windowMs,
        limit,
        result.prevCount,
        result.currCount,
      );
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
        retryAfterSec: Math.max(
          0,
          Math.ceil((resetAt - currentNow) / 1000),
        ),
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, Math.ceil(limit - result.estimate) - 1),
      resetAt: nextBoundary,
    };
  }

  /**
   * Earliest integer ms when a retry would be allowed with no intervening
   * requests. Prefers mid-window decay when prevCount > 0.
   */
  private computeResetAt(
    now: number,
    C: number,
    windowMs: number,
    limit: number,
    prevCount: number,
    currCount: number,
  ): number {
    const nextBoundary = C + windowMs;

    if (prevCount <= 0) {
      return nextBoundary;
    }

    // Solve: prevCount * (1 - (t - C) / windowMs) + currCount < limit
    // => weight < (limit - currCount) / prevCount
    // => (t - C) / windowMs > 1 - (limit - currCount) / prevCount
    const threshold = (limit - currCount) / prevCount;
    if (!(threshold > 0)) {
      // currCount alone already >= limit; decay cannot help in this window.
      return nextBoundary;
    }

    // Need weight < threshold, i.e. elapsed > windowMs * (1 - threshold)
    const minElapsed = windowMs * (1 - threshold);
    // Smallest integer t such that (t - C) > minElapsed when threshold is
    // exclusive on weight; use ceil of the first elapsed that satisfies
    // estimate(t) < limit.
    let t = Math.ceil(C + minElapsed);
    // Ensure strictly after now and that estimate at t is < limit.
    if (t <= now) {
      t = now + 1;
    }

    // Walk forward a few ms if float residue still blocks (relational only).
    while (t < nextBoundary) {
      const elapsed = t - C;
      const weight = 1 - elapsed / windowMs;
      const estimate = prevCount * weight + currCount;
      if (estimate < limit) {
        return t;
      }
      t += 1;
    }

    return nextBoundary;
  }
}
