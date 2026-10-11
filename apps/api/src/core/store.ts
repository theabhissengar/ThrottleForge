import { ClientId } from './identity';

export interface WindowRecord {
  windowStart: number;
  count: number;
}

/**
 * Storage contract for rate-limit state.
 *
 * Milestone 1 uses a synchronous check-and-increment path (see
 * {@link SyncRateLimitStore.tryConsume}). Future Redis implementations must
 * provide equivalent atomic semantics — separate async get/set is not enough.
 */
export interface SyncRateLimitStore {
  /**
   * Atomically (within one sync critical section): load/reset window,
   * decide allow/reject, and persist. No asynchronous gap may occur inside.
   */
  tryConsume(
    key: ClientId,
    windowStart: number,
    limit: number,
  ): { allowed: boolean; count: number };
}

export interface RateLimiter {
  consume(clientId: ClientId, now?: number): import('./decision').Decision;
}
