import { InvalidPolicyError } from './errors';

export interface FixedWindowPolicy {
  /** Maximum allowed requests per window (inclusive). */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Same knobs as fixed window; estimate threshold uses `limit`. */
export type SlidingWindowPolicy = FixedWindowPolicy;

export interface TokenBucketPolicy {
  /** Maximum tokens (burst ceiling). */
  capacity: number;
  /** Tokens added per millisecond. */
  refillPerMs: number;
}

function assertPositiveInteger(
  value: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidPolicyError(
      `${name} must be a positive integer (>= 1)`,
    );
  }
}

export function validateFixedWindowPolicy(
  policy: FixedWindowPolicy,
): FixedWindowPolicy {
  if (policy == null || typeof policy !== 'object') {
    throw new InvalidPolicyError('Policy must be an object');
  }

  const { limit, windowMs } = policy;
  assertPositiveInteger(limit, 'limit');
  assertPositiveInteger(windowMs, 'windowMs');

  return { limit, windowMs };
}

export function validateSlidingWindowPolicy(
  policy: SlidingWindowPolicy,
): SlidingWindowPolicy {
  return validateFixedWindowPolicy(policy);
}

export function validateTokenBucketPolicy(
  policy: TokenBucketPolicy,
): TokenBucketPolicy {
  if (policy == null || typeof policy !== 'object') {
    throw new InvalidPolicyError('Policy must be an object');
  }

  const { capacity, refillPerMs } = policy;
  assertPositiveInteger(capacity, 'capacity');

  if (
    typeof refillPerMs !== 'number' ||
    !Number.isFinite(refillPerMs) ||
    refillPerMs <= 0
  ) {
    throw new InvalidPolicyError(
      'refillPerMs must be a finite number > 0',
    );
  }

  return { capacity, refillPerMs };
}

/**
 * Policy-equivalent mapping for fair comparison scenarios:
 * capacity = limit, refillPerMs = limit / windowMs.
 */
export function tokenBucketFromWindow(policy: {
  limit: number;
  windowMs: number;
}): TokenBucketPolicy {
  const { limit, windowMs } = validateFixedWindowPolicy(policy);
  return validateTokenBucketPolicy({
    capacity: limit,
    refillPerMs: limit / windowMs,
  });
}
