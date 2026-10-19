import Redis from 'ioredis';
import { RedisEvalClient } from '../core/fixed-window.redis-store';

export interface RedisConnectionOptions {
  url: string;
  prefix: string;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
}

export interface RedisClientSettings {
  maxRetriesPerRequest: 0;
  enableOfflineQueue: false;
  connectTimeout: number;
  commandTimeout: number;
  retryStrategy: () => null;
}

/**
 * A timed-out EVAL may already have run. Do not queue or replay it.
 * retryStrategy returns null so a dead connection is not retried forever.
 */
export function redisClientOptions(input: {
  connectTimeoutMs: number;
  commandTimeoutMs: number;
}): RedisClientSettings {
  return {
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: input.connectTimeoutMs,
    commandTimeout: input.commandTimeoutMs,
    retryStrategy: () => null,
  };
}

export function createIoredis(options: RedisConnectionOptions): Redis {
  const redis = new Redis(options.url, redisClientOptions(options));
  redis.on('error', () => {
    // Command promises reject. This listener keeps a refused connection
    // from becoming an unhandled error event.
  });
  return redis;
}

/** Resolves once the socket can accept commands. Does not retry a timed-out EVAL. */
export function waitForRedisReady(redis: Redis, timeoutMs: number): Promise<void> {
  if (redis.status === 'ready') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Redis connection timed out'));
    }, timeoutMs);
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error('Redis connection closed'));
    };
    function cleanup(): void {
      clearTimeout(timer);
      redis.off('ready', onReady);
      redis.off('close', onClose);
    }
    redis.once('ready', onReady);
    redis.once('close', onClose);
    if (redis.status === 'ready') {
      onReady();
    }
  });
}

export function asRedisEvalClient(redis: Redis): RedisEvalClient {
  return {
    eval: (script, keys, args) =>
      redis.eval(script, keys.length, ...keys, ...args),
  };
}

export type ClosableRedisEvalClient = RedisEvalClient & {
  quit?: () => Promise<unknown>;
  ready?: () => Promise<void>;
};

export function createIoredisEvalClient(
  options: RedisConnectionOptions,
): RedisEvalClient & {
  quit: () => Promise<void>;
  ready: () => Promise<void>;
} {
  const redis = createIoredis(options);
  return {
    eval: (script, keys, args) =>
      redis.eval(script, keys.length, ...keys, ...args),
    quit: async () => {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
    ready: () => waitForRedisReady(redis, options.connectTimeoutMs),
  };
}

/** Test and shutdown helper. Does not FLUSHDB. */
export async function deleteKeysByPrefix(
  redis: Redis,
  prefix: string,
): Promise<number> {
  const match = `${prefix}:*`;
  let cursor = '0';
  let deleted = 0;
  do {
    const reply = await redis.scan(cursor, 'MATCH', match, 'COUNT', 100);
    cursor = reply[0];
    const keys = reply[1];
    if (keys.length > 0) {
      deleted += await redis.unlink(...keys);
    }
  } while (cursor !== '0');
  return deleted;
}
