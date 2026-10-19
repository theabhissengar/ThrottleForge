import { AsyncConsumeOutcome, AsyncRateLimiter, AsyncRateLimitStore, RedisFailureMode } from './async-store';
import { Clock, SystemClock } from './clock';
import { InvalidPolicyError } from './errors';
import { fixedWindowDecision, fixedWindowTtlMs } from './fixed-window.decision';
import { calendarWindowStart } from './fixed-window.limiter';
import { ClientId } from './identity';
import { FixedWindowPolicy, validateFixedWindowPolicy } from './policy';

/**
 * Fixed-window limiter whose critical section is one async store call.
 * Store failures become `{ type: 'unavailable' }` with no invented remaining.
 * Invalid policy arguments still throw.
 */
export class AsyncFixedWindowLimiter implements AsyncRateLimiter {
  private readonly policy: FixedWindowPolicy;

  constructor(
    policy: FixedWindowPolicy,
    private readonly store: AsyncRateLimitStore,
    private readonly clock: Clock = new SystemClock(),
    readonly onStoreError: RedisFailureMode = 'closed',
  ) {
    this.policy = validateFixedWindowPolicy(policy);
  }

  async consume(clientId: ClientId, now?: number): Promise<AsyncConsumeOutcome> {
    const currentNow = now ?? this.clock.now();
    const { limit, windowMs } = this.policy;
    const windowStart = calendarWindowStart(currentNow, windowMs);
    const resetAt = windowStart + windowMs;
    const ttlMs = fixedWindowTtlMs(resetAt, currentNow);

    try {
      const result = await this.store.tryConsume(
        clientId,
        windowStart,
        limit,
        ttlMs,
      );
      return {
        type: 'ok',
        decision: fixedWindowDecision({
          allowed: result.allowed,
          count: result.count,
          limit,
          now: currentNow,
          resetAt,
        }),
      };
    } catch (err) {
      if (err instanceof InvalidPolicyError) {
        throw err;
      }
      return { type: 'unavailable' };
    }
  }
}
