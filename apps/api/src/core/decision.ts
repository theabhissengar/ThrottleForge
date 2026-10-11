export interface Decision {
  allowed: boolean;
  limit: number;
  /** Requests remaining after this decision (0 when rejected or last slot taken). */
  remaining: number;
  /** Epoch ms when the next window begins. */
  resetAt: number;
  /** Present only when rejected; Retry-After in whole seconds. */
  retryAfterSec?: number;
}
