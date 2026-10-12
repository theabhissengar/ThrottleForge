import { InvalidPolicyError } from '../../src/core/errors';
import {
  tokenBucketFromWindow,
  validateFixedWindowPolicy,
  validateSlidingWindowPolicy,
  validateTokenBucketPolicy,
} from '../../src/core/policy';

describe('validateFixedWindowPolicy', () => {
  it('accepts a valid policy', () => {
    expect(validateFixedWindowPolicy({ limit: 10, windowMs: 1000 })).toEqual({
      limit: 10,
      windowMs: 1000,
    });
  });

  it('rejects non-positive limit', () => {
    expect(() =>
      validateFixedWindowPolicy({ limit: 0, windowMs: 1000 }),
    ).toThrow(InvalidPolicyError);
  });

  it('rejects non-integer limit', () => {
    expect(() =>
      validateFixedWindowPolicy({ limit: 1.5, windowMs: 1000 }),
    ).toThrow(InvalidPolicyError);
  });

  it('rejects non-positive windowMs', () => {
    expect(() =>
      validateFixedWindowPolicy({ limit: 5, windowMs: 0 }),
    ).toThrow(InvalidPolicyError);
  });

  it('rejects non-integer windowMs', () => {
    expect(() =>
      validateFixedWindowPolicy({ limit: 5, windowMs: 100.5 }),
    ).toThrow(InvalidPolicyError);
  });
});

describe('validateSlidingWindowPolicy', () => {
  it('accepts the same shape as fixed window', () => {
    expect(
      validateSlidingWindowPolicy({ limit: 10, windowMs: 1000 }),
    ).toEqual({ limit: 10, windowMs: 1000 });
  });

  it('rejects invalid limit', () => {
    expect(() =>
      validateSlidingWindowPolicy({ limit: 0, windowMs: 1000 }),
    ).toThrow(InvalidPolicyError);
  });
});

describe('validateTokenBucketPolicy', () => {
  it('accepts a valid policy', () => {
    expect(
      validateTokenBucketPolicy({ capacity: 10, refillPerMs: 0.01 }),
    ).toEqual({ capacity: 10, refillPerMs: 0.01 });
  });

  it('rejects non-positive capacity', () => {
    expect(() =>
      validateTokenBucketPolicy({ capacity: 0, refillPerMs: 1 }),
    ).toThrow(InvalidPolicyError);
  });

  it('rejects non-integer capacity', () => {
    expect(() =>
      validateTokenBucketPolicy({ capacity: 1.5, refillPerMs: 1 }),
    ).toThrow(InvalidPolicyError);
  });

  it('rejects non-finite refillPerMs', () => {
    expect(() =>
      validateTokenBucketPolicy({ capacity: 5, refillPerMs: NaN }),
    ).toThrow(InvalidPolicyError);
    expect(() =>
      validateTokenBucketPolicy({ capacity: 5, refillPerMs: Infinity }),
    ).toThrow(InvalidPolicyError);
  });

  it('rejects non-positive refillPerMs', () => {
    expect(() =>
      validateTokenBucketPolicy({ capacity: 5, refillPerMs: 0 }),
    ).toThrow(InvalidPolicyError);
    expect(() =>
      validateTokenBucketPolicy({ capacity: 5, refillPerMs: -0.1 }),
    ).toThrow(InvalidPolicyError);
  });
});

describe('tokenBucketFromWindow', () => {
  it('maps limit/windowMs to capacity and refillPerMs', () => {
    expect(tokenBucketFromWindow({ limit: 10, windowMs: 1000 })).toEqual({
      capacity: 10,
      refillPerMs: 10 / 1000,
    });
  });

  it('rejects invalid window policy', () => {
    expect(() =>
      tokenBucketFromWindow({ limit: 0, windowMs: 1000 }),
    ).toThrow(InvalidPolicyError);
  });
});
