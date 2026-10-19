import { Decision } from './decision';
import { ClientId } from './identity';

export interface TryConsumeResult {
  allowed: boolean;
  count: number;
}

/**
 * Distributed fixed-window store. One call must check and increment atomically.
 * Separate get/set round trips are not a valid implementation.
 */
export interface AsyncRateLimitStore {
  tryConsume(
    key: ClientId,
    windowStart: number,
    limit: number,
    ttlMs: number,
  ): Promise<TryConsumeResult>;
}

/**
 * A Redis failure is not a Decision. `remaining` is unknown, so it is omitted.
 */
export type AsyncConsumeOutcome =
  | { type: 'ok'; decision: Decision }
  | { type: 'unavailable' };

export interface AsyncRateLimiter {
  consume(clientId: ClientId, now?: number): Promise<AsyncConsumeOutcome>;
}

/** Opt-in fail-open still returns `unavailable`; the HTTP layer decides the status. */
export type RedisFailureMode = 'open' | 'closed';
