import { TryConsumeResult } from './async-store';
import { InvalidPolicyError } from './errors';
import { ClientId } from './identity';

/**
 * Minimal Redis surface. The core does not import ioredis.
 * One `eval` is one round trip; callers must not retry it.
 */
export interface RedisEvalClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export const DEFAULT_REDIS_KEY_PREFIX = 'tf:fw:v1';

/**
 * Fixed-window consume. Other clients cannot interleave, but a failed
 * command does not roll back earlier writes on Redis 6. Expiry failure is
 * repaired inside this script. Node must not send a follow-up write.
 */
export const FIXED_WINDOW_CONSUME_LUA = `
local windowArg = ARGV[1]
local limit = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[3])
if windowArg == nil or windowArg == '' or limit == nil or limit < 1 or ttlMs == nil or ttlMs < 1 then
  return redis.error_reply('invalid-args')
end

local prevWindow = redis.call('HGET', KEYS[1], 'w')
local prevCount = redis.call('HGET', KEYS[1], 'c')
local prevTtl = redis.call('PTTL', KEYS[1])
local existed = prevWindow ~= false

local count = 0
if prevWindow == windowArg then
  count = tonumber(prevCount) or 0
end

if count >= limit then
  local refreshed = redis.pcall('PEXPIRE', KEYS[1], ttlMs)
  if type(refreshed) == 'table' and refreshed.err then
    if tonumber(prevTtl) ~= nil and tonumber(prevTtl) > 0 then
      return {0, count}
    end
    return redis.error_reply('expire-failed')
  end
  return {0, count}
end

count = count + 1
local wrote = redis.pcall('HSET', KEYS[1], 'w', windowArg, 'c', count)
if type(wrote) == 'table' and wrote.err then
  return redis.error_reply('write-failed')
end
local expired = redis.pcall('PEXPIRE', KEYS[1], ttlMs)
if type(expired) ~= 'table' or not expired.err then
  return {1, count}
end

if not existed then
  redis.pcall('DEL', KEYS[1])
else
  redis.pcall('HSET', KEYS[1], 'w', prevWindow, 'c', prevCount)
  if tonumber(prevTtl) ~= nil and tonumber(prevTtl) > 0 then
    redis.pcall('PEXPIRE', KEYS[1], prevTtl)
  end
end
return redis.error_reply('expire-failed')
`;

export function fixedWindowRedisKey(
  prefix: string,
  windowMs: number,
  clientId: ClientId,
): string {
  return `${prefix}:${windowMs}:${clientId}`;
}

function assertConsumeArgs(
  key: ClientId,
  windowStart: number,
  limit: number,
  ttlMs: number,
): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new InvalidPolicyError('key must be a non-empty string');
  }
  if (!Number.isInteger(windowStart)) {
    throw new InvalidPolicyError('windowStart must be an integer');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidPolicyError('limit must be a positive integer (>= 1)');
  }
  if (!Number.isInteger(ttlMs) || ttlMs < 1) {
    throw new InvalidPolicyError('ttlMs must be a positive integer (>= 1)');
  }
}

function parseScriptReply(raw: unknown): TryConsumeResult {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error('malformed script reply');
  }
  const allowedFlag = Number(raw[0]);
  const count = Number(raw[1]);
  if (
    (allowedFlag !== 0 && allowedFlag !== 1) ||
    !Number.isInteger(count) ||
    count < 0
  ) {
    throw new Error('malformed script reply');
  }
  return { allowed: allowedFlag === 1, count };
}

/**
 * Fixed-window counters in Redis. The key includes windowMs so two policies
 * do not share a counter. limit is an argument, so a limit change applies to
 * the current count. TTL is Redis expiry, not an in-process sweep.
 */
export class RedisFixedWindowStore {
  constructor(
    private readonly client: RedisEvalClient,
    private readonly prefix: string,
    private readonly windowMs: number,
  ) {
    if (typeof prefix !== 'string' || prefix.length === 0) {
      throw new InvalidPolicyError('Redis key prefix must be a non-empty string');
    }
    if (!Number.isInteger(windowMs) || windowMs < 1) {
      throw new InvalidPolicyError('windowMs must be a positive integer (>= 1)');
    }
  }

  async tryConsume(
    key: ClientId,
    windowStart: number,
    limit: number,
    ttlMs: number,
  ): Promise<TryConsumeResult> {
    assertConsumeArgs(key, windowStart, limit, ttlMs);
    const redisKey = fixedWindowRedisKey(this.prefix, this.windowMs, key);
    const raw = await this.client.eval(FIXED_WINDOW_CONSUME_LUA, [redisKey], [
      String(windowStart),
      String(limit),
      String(ttlMs),
    ]);
    return parseScriptReply(raw);
  }
}
