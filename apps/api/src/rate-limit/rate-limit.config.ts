import { RedisFailureMode } from '../core/async-store';
import { FixedWindowPolicy } from '../core/policy';
import { RedisConnectionOptions } from './ioredis.client';

export const RATE_LIMIT_POLICY = 'RATE_LIMIT_POLICY';
export const RATE_LIMIT_ALLOW_TEST_CLIENT_ID =
  'RATE_LIMIT_ALLOW_TEST_CLIENT_ID';
export const RATE_LIMIT_STORE_KIND = 'RATE_LIMIT_STORE_KIND';
export const RATE_LIMIT_ON_REDIS_ERROR = 'RATE_LIMIT_ON_REDIS_ERROR';
export const RATE_LIMIT_REDIS_OPTIONS = 'RATE_LIMIT_REDIS_OPTIONS';
export const RATE_LIMIT_EVAL_CLIENT = 'RATE_LIMIT_EVAL_CLIENT';

export type RateLimitStoreKind = 'memory' | 'redis';

const DEFAULT_CONNECT_TIMEOUT_MS = 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 200;

export function loadFixedWindowPolicyFromEnv(): FixedWindowPolicy {
  const limit = Number.parseInt(process.env.RATE_LIMIT ?? '5', 10);
  const windowMs = Number.parseInt(process.env.RATE_WINDOW_MS ?? '60000', 10);
  return { limit, windowMs };
}

/**
 * Test identity override is allowed only when explicitly enabled and the
 * process is in test or development mode. Production must leave this off.
 */
export function loadAllowTestClientIdFromEnv(): boolean {
  const flag = process.env.ALLOW_TEST_CLIENT_ID === 'true';
  const env = process.env.NODE_ENV ?? 'development';
  return flag && (env === 'test' || env === 'development');
}

function positiveIntFromEnv(raw: string | undefined, name: string, fallback: number): number {
  const value = raw === undefined || raw === '' ? fallback : Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadRateLimitStoreKindFromEnv(): RateLimitStoreKind {
  const raw = process.env.RATE_LIMIT_STORE ?? 'memory';
  if (raw === 'memory' || raw === 'redis') {
    return raw;
  }
  throw new Error(`RATE_LIMIT_STORE must be memory or redis (got ${raw})`);
}

export function loadRedisFailureModeFromEnv(): RedisFailureMode {
  const raw = process.env.RATE_LIMIT_ON_REDIS_ERROR ?? 'closed';
  if (raw === 'open' || raw === 'closed') {
    return raw;
  }
  throw new Error(
    `RATE_LIMIT_ON_REDIS_ERROR must be open or closed (got ${raw})`,
  );
}

export function loadRedisConnectionOptionsFromEnv(): RedisConnectionOptions | null {
  if (loadRateLimitStoreKindFromEnv() !== 'redis') {
    return null;
  }
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required when RATE_LIMIT_STORE=redis');
  }
  return {
    url,
    prefix: process.env.RATE_LIMIT_REDIS_PREFIX || 'tf:fw:v1',
    connectTimeoutMs: positiveIntFromEnv(
      process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS,
      'RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS',
      DEFAULT_CONNECT_TIMEOUT_MS,
    ),
    commandTimeoutMs: positiveIntFromEnv(
      process.env.RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS,
      'RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS',
      DEFAULT_COMMAND_TIMEOUT_MS,
    ),
  };
}
