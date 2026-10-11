import { InvalidPolicyError } from '../../src/core/errors';
import { validateFixedWindowPolicy } from '../../src/core/policy';

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
