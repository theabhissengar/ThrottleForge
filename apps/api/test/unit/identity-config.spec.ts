import { loadAllowTestClientIdFromEnv } from '../../src/rate-limit/rate-limit.config';

describe('loadAllowTestClientIdFromEnv', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('is false when flag is unset', () => {
    delete process.env.ALLOW_TEST_CLIENT_ID;
    process.env.NODE_ENV = 'development';
    expect(loadAllowTestClientIdFromEnv()).toBe(false);
  });

  it('is false in production even if flag is true', () => {
    process.env.ALLOW_TEST_CLIENT_ID = 'true';
    process.env.NODE_ENV = 'production';
    expect(loadAllowTestClientIdFromEnv()).toBe(false);
  });

  it('is true in test when flag is true', () => {
    process.env.ALLOW_TEST_CLIENT_ID = 'true';
    process.env.NODE_ENV = 'test';
    expect(loadAllowTestClientIdFromEnv()).toBe(true);
  });
});
