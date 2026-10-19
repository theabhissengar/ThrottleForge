import { Decision } from './decision';

/**
 * Shared allow/reject math for the sync and async fixed-window limiters.
 * `remaining` is only meaningful after a real counter result.
 */
export function fixedWindowDecision(input: {
  allowed: boolean;
  count: number;
  limit: number;
  now: number;
  resetAt: number;
}): Decision {
  const { allowed, count, limit, now, resetAt } = input;
  if (!allowed) {
    const retryAfterSec = Math.max(0, Math.ceil((resetAt - now) / 1000));
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
    remaining: limit - count,
    resetAt,
  };
}

/** Relative TTL so a past FakeClock does not absolute-expire a live Redis key. */
export function fixedWindowTtlMs(resetAt: number, now: number): number {
  return Math.max(1, resetAt - now);
}
