/**
 * Real Redis. Excluded from the default Jest run (`*.redis.spec.ts`).
 * Requires REDIS_URL and fails if Redis cannot be pinged.
 */
import Redis from 'ioredis';
import { AsyncFixedWindowLimiter } from '../../src/core/async-fixed-window.limiter';
import { FakeClock } from '../../src/core/clock';
import { calendarWindowStart } from '../../src/core/fixed-window.limiter';
import {
  RedisFixedWindowStore,
  fixedWindowRedisKey,
} from '../../src/core/fixed-window.redis-store';
import {
  asRedisEvalClient,
  createIoredis,
  createIoredisEvalClient,
  deleteKeysByPrefix,
  waitForRedisReady,
} from '../../src/rate-limit/ioredis.client';

const REDIS_URL = process.env.REDIS_URL ?? '';
const WINDOW_MS = 10_000;
const LIMIT = 3;
const BASE = 1_700_000_040_000;

function prefixFor(name: string): string {
  return `tf:fw:test:${process.pid}:${name}:${Date.now()}:${Math.random()
    .toString(16)
    .slice(2)}`;
}

describe('Redis fixed-window shared quota', () => {
  let redisA: Redis;
  let redisB: Redis;

  beforeAll(async () => {
    if (!REDIS_URL) {
      throw new Error('REDIS_URL is required for Redis integration tests');
    }
    const probe = createIoredis({
      url: REDIS_URL,
      prefix: 'tf:fw:probe',
      connectTimeoutMs: 1000,
      commandTimeoutMs: 1000,
    });
    try {
      await waitForRedisReady(probe, 1000);
      const pong = await probe.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING reply: ${pong}`);
      }
    } catch (err) {
      throw new Error(
        `Redis unreachable at ${REDIS_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      probe.disconnect();
    }

    const connection = {
      url: REDIS_URL,
      prefix: 'tf:fw:v1',
      connectTimeoutMs: 1000,
      commandTimeoutMs: 1000,
    };
    redisA = createIoredis(connection);
    redisB = createIoredis(connection);
    await Promise.all([
      waitForRedisReady(redisA, 1000),
      waitForRedisReady(redisB, 1000),
    ]);
  });

  afterAll(async () => {
    await redisA?.quit();
    await redisB?.quit();
  });

  function limiters(prefix: string, limit = LIMIT) {
    const clock = new FakeClock(BASE);
    const storeA = new RedisFixedWindowStore(
      asRedisEvalClient(redisA),
      prefix,
      WINDOW_MS,
    );
    const storeB = new RedisFixedWindowStore(
      asRedisEvalClient(redisB),
      prefix,
      WINDOW_MS,
    );
    return {
      clock,
      a: new AsyncFixedWindowLimiter(
        { limit, windowMs: WINDOW_MS },
        storeA,
        clock,
      ),
      b: new AsyncFixedWindowLimiter(
        { limit, windowMs: WINDOW_MS },
        storeB,
        clock,
      ),
    };
  }

  it('shares one quota across two connections', async () => {
    const prefix = prefixFor('share');
    try {
      const { a, b } = limiters(prefix);
      for (let i = 0; i < LIMIT - 1; i += 1) {
        const outcome = await a.consume('ip:shared', BASE);
        expect(outcome.type).toBe('ok');
        if (outcome.type === 'ok') {
          expect(outcome.decision.allowed).toBe(true);
        }
      }
      const last = await b.consume('ip:shared', BASE);
      expect(last).toMatchObject({
        type: 'ok',
        decision: { allowed: true, remaining: 0 },
      });
      const rejected = await b.consume('ip:shared', BASE);
      expect(rejected).toMatchObject({
        type: 'ok',
        decision: { allowed: false, remaining: 0 },
      });
    } finally {
      await deleteKeysByPrefix(redisA, prefix);
    }
  });

  it('allows exactly the limit under a simultaneous burst', async () => {
    const prefix = prefixFor('burst');
    try {
      const { a, b } = limiters(prefix, 5);
      const burst = 20;
      const outcomes = await Promise.all(
        Array.from({ length: burst }, (_, i) =>
          (i % 2 === 0 ? a : b).consume('ip:burst', BASE),
        ),
      );
      const allowed = outcomes.filter(
        (outcome) => outcome.type === 'ok' && outcome.decision.allowed,
      );
      expect(allowed).toHaveLength(5);
      for (const outcome of outcomes) {
        expect(outcome.type).toBe('ok');
        if (outcome.type === 'ok' && !outcome.decision.allowed) {
          expect(outcome.decision.remaining).toBe(0);
        }
      }
      const count = await redisA.hget(
        fixedWindowRedisKey(prefix, WINDOW_MS, 'ip:burst'),
        'c',
      );
      expect(count).toBe('5');
    } finally {
      await deleteKeysByPrefix(redisA, prefix);
    }
  });

  it('resets at the next calendar window for both instances', async () => {
    const prefix = prefixFor('boundary');
    try {
      const { a, b } = limiters(prefix, 2);
      await a.consume('ip:edge', BASE);
      await b.consume('ip:edge', BASE);
      expect((await a.consume('ip:edge', BASE)).type).toBe('ok');
      const fullA = await a.consume('ip:edge', BASE);
      const fullB = await b.consume('ip:edge', BASE);
      expect(fullA).toMatchObject({ type: 'ok', decision: { allowed: false } });
      expect(fullB).toMatchObject({ type: 'ok', decision: { allowed: false } });

      const next = calendarWindowStart(BASE, WINDOW_MS) + WINDOW_MS;
      const fresh = await a.consume('ip:edge', next);
      expect(fresh).toMatchObject({ type: 'ok', decision: { allowed: true } });
      const count = await redisB.hget(
        fixedWindowRedisKey(prefix, WINDOW_MS, 'ip:edge'),
        'c',
      );
      expect(count).toBe('1');
      const also = await b.consume('ip:edge', next);
      expect(also).toMatchObject({ type: 'ok', decision: { allowed: true } });
    } finally {
      await deleteKeysByPrefix(redisA, prefix);
    }
  });

  it('sets a positive TTL on allow and shrinks it on later rejects', async () => {
    const prefix = prefixFor('ttl');
    const key = fixedWindowRedisKey(prefix, WINDOW_MS, 'ip:ttl');
    try {
      const { a } = limiters(prefix, 1);
      const created = await a.consume('ip:ttl', BASE);
      expect(created).toMatchObject({ type: 'ok', decision: { allowed: true } });
      const createdTtl = await redisA.pttl(key);
      expect(createdTtl).toBeGreaterThan(0);
      expect(createdTtl).toBeLessThanOrEqual(WINDOW_MS);

      const mid = BASE + 4_000;
      const rejected = await a.consume('ip:ttl', mid);
      expect(rejected).toMatchObject({
        type: 'ok',
        decision: { allowed: false },
      });
      const midTtl = await redisA.pttl(key);
      expect(midTtl).toBeGreaterThan(0);
      expect(midTtl).toBeLessThanOrEqual(WINDOW_MS - 4_000);
      expect(midTtl).toBeGreaterThan(WINDOW_MS - 4_000 - 1_500);
      expect(midTtl).toBeLessThan(WINDOW_MS - 1_000);

      const later = BASE + 7_000;
      await a.consume('ip:ttl', later);
      const laterTtl = await redisA.pttl(key);
      expect(laterTtl).toBeGreaterThan(0);
      expect(laterTtl).toBeLessThan(midTtl);
      expect(laterTtl).toBeLessThanOrEqual(WINDOW_MS - 7_000);
    } finally {
      await deleteKeysByPrefix(redisA, prefix);
    }
  });

  it('replaces a stale window and its long TTL', async () => {
    const prefix = prefixFor('stale');
    const key = fixedWindowRedisKey(prefix, WINDOW_MS, 'ip:stale');
    const windowStart = calendarWindowStart(BASE, WINDOW_MS);
    try {
      await redisA.hset(key, 'w', String(windowStart - WINDOW_MS), 'c', String(LIMIT));
      await redisA.pexpire(key, 120_000);

      const { a } = limiters(prefix);
      const outcome = await a.consume('ip:stale', BASE);
      expect(outcome).toMatchObject({ type: 'ok', decision: { allowed: true } });
      expect(await redisA.hget(key, 'w')).toBe(String(windowStart));
      expect(await redisA.hget(key, 'c')).toBe('1');
      const ttl = await redisA.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(WINDOW_MS);
      expect(ttl).toBeLessThan(60_000);
    } finally {
      await deleteKeysByPrefix(redisA, prefix);
    }
  });

  it('applies a higher limit and rejects when the limit drops to the current count', async () => {
    const prefix = prefixFor('limit');
    const key = fixedWindowRedisKey(prefix, WINDOW_MS, 'ip:limit');
    try {
      const raised = limiters(prefix, 5);
      for (let i = 0; i < 3; i += 1) {
        const outcome = await raised.a.consume('ip:limit', BASE);
        expect(outcome).toMatchObject({ type: 'ok', decision: { allowed: true } });
      }
      const fourth = await raised.b.consume('ip:limit', BASE);
      expect(fourth).toMatchObject({ type: 'ok', decision: { allowed: true } });
      expect(await redisA.hget(key, 'c')).toBe('4');

      const tightened = limiters(prefix, 4);
      const rejected = await tightened.a.consume('ip:limit', BASE);
      expect(rejected).toMatchObject({
        type: 'ok',
        decision: { allowed: false, remaining: 0 },
      });
      expect(await redisA.hget(key, 'c')).toBe('4');
    } finally {
      await deleteKeysByPrefix(redisA, prefix);
    }
  });

  it('isolates clients, prefixes, and window lengths', async () => {
    const prefix = prefixFor('iso');
    const otherPrefix = prefixFor('iso-other');
    try {
      const { a } = limiters(prefix, 1);
      expect(await a.consume('ip:a', BASE)).toMatchObject({
        type: 'ok',
        decision: { allowed: true },
      });
      expect(await a.consume('ip:a', BASE)).toMatchObject({
        type: 'ok',
        decision: { allowed: false },
      });
      expect(await a.consume('ip:b', BASE)).toMatchObject({
        type: 'ok',
        decision: { allowed: true },
      });

      const other = new AsyncFixedWindowLimiter(
        { limit: 1, windowMs: WINDOW_MS },
        new RedisFixedWindowStore(asRedisEvalClient(redisB), otherPrefix, WINDOW_MS),
        new FakeClock(BASE),
      );
      expect(await other.consume('ip:a', BASE)).toMatchObject({
        type: 'ok',
        decision: { allowed: true },
      });

      const otherWindow = new AsyncFixedWindowLimiter(
        { limit: 1, windowMs: WINDOW_MS * 2 },
        new RedisFixedWindowStore(
          asRedisEvalClient(redisB),
          prefix,
          WINDOW_MS * 2,
        ),
        new FakeClock(BASE),
      );
      expect(await otherWindow.consume('ip:a', BASE)).toMatchObject({
        type: 'ok',
        decision: { allowed: true },
      });

      expect(await redisA.hget(fixedWindowRedisKey(prefix, WINDOW_MS, 'ip:a'), 'c')).toBe(
        '1',
      );
    } finally {
      await deleteKeysByPrefix(redisA, prefix);
      await deleteKeysByPrefix(redisA, otherPrefix);
    }
  });

  it('removes seeded keys with the prefix cleanup helper', async () => {
    const prefix = prefixFor('cleanup');
    const key = fixedWindowRedisKey(prefix, WINDOW_MS, 'ip:cleanup');
    await redisA.hset(key, 'w', String(BASE), 'c', '1');
    expect(await redisA.exists(key)).toBe(1);
    const deleted = await deleteKeysByPrefix(redisA, prefix);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await redisA.exists(key)).toBe(0);
  });

  it('settles as unavailable when Redis refuses the connection', async () => {
    const client = createIoredisEvalClient({
      url: 'redis://127.0.0.1:1',
      prefix: 'tf:fw:down',
      connectTimeoutMs: 300,
      commandTimeoutMs: 300,
    });
    const limiter = new AsyncFixedWindowLimiter(
      { limit: 1, windowMs: 1000 },
      new RedisFixedWindowStore(client, 'tf:fw:down', 1000),
      new FakeClock(BASE),
      'closed',
    );
    const started = Date.now();
    await expect(limiter.consume('ip:down', BASE)).resolves.toEqual({
      type: 'unavailable',
    });
    expect(Date.now() - started).toBeLessThan(3000);
    await client.quit();
  });
});
