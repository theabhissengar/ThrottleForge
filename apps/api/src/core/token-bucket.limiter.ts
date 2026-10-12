import { Clock, SystemClock } from './clock';
import { Decision } from './decision';
import { ClientId } from './identity';
import {
  TokenBucketPolicy,
  validateTokenBucketPolicy,
} from './policy';
import { RateLimiter } from './store';
import { TokenBucketStore } from './token-bucket.store';

/**
 * Token-bucket rate limiter: refill then consume one token when balance >= 1.
 */
export class TokenBucketLimiter implements RateLimiter {
  private readonly policy: TokenBucketPolicy;

  constructor(
    policy: TokenBucketPolicy,
    private readonly store: TokenBucketStore,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.policy = validateTokenBucketPolicy(policy);
  }

  consume(clientId: ClientId, now?: number): Decision {
    const currentNow = now ?? this.clock.now();
    const { capacity, refillPerMs } = this.policy;

    const result = this.store.tryConsume(
      clientId,
      currentNow,
      capacity,
      refillPerMs,
    );

    if (!result.allowed) {
      const resetAt = Math.ceil(
        currentNow + (1 - result.tokens) / refillPerMs,
      );
      return {
        allowed: false,
        limit: capacity,
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
      limit: capacity,
      remaining: Math.floor(result.tokens),
      resetAt: Math.ceil(
        currentNow + (capacity - result.tokens) / refillPerMs,
      ),
    };
  }
}
