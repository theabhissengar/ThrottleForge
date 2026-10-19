import { redisClientOptions } from '../../src/rate-limit/ioredis.client';

describe('redisClientOptions', () => {
  it('disables command retry and sets a finite command timeout', () => {
    const options = redisClientOptions({
      connectTimeoutMs: 1000,
      commandTimeoutMs: 200,
    });

    expect(options.maxRetriesPerRequest).toBe(0);
    expect(options.enableOfflineQueue).toBe(false);
    expect(Number.isFinite(options.commandTimeout)).toBe(true);
    expect(options.commandTimeout).toBeGreaterThan(0);
    expect(options.connectTimeout).toBe(1000);
    expect(options.retryStrategy()).toBeNull();
  });
});
