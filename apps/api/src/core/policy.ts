import { InvalidPolicyError } from './errors';

export interface FixedWindowPolicy {
  /** Maximum allowed requests per window (inclusive). */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export function validateFixedWindowPolicy(
  policy: FixedWindowPolicy,
): FixedWindowPolicy {
  if (policy == null || typeof policy !== 'object') {
    throw new InvalidPolicyError('Policy must be an object');
  }

  const { limit, windowMs } = policy;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidPolicyError(
      'limit must be a positive integer (>= 1)',
    );
  }

  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new InvalidPolicyError(
      'windowMs must be a positive integer (>= 1)',
    );
  }

  return { limit, windowMs };
}
