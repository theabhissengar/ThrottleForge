import { AsyncFixedWindowLimiter } from '../../src/core/async-fixed-window.limiter';
import { RedisFailureMode } from '../../src/core/async-store';
import { FakeClock } from '../../src/core/clock';
import { InvalidPolicyError } from '../../src/core/errors';
import { FixedWindowLimiter } from '../../src/core/fixed-window.limiter';
import {
  RedisEvalClient,
  RedisFixedWindowStore,
} from '../../src/core/fixed-window.redis-store';
import { InMemoryStore } from '../../src/core/in-memory.store';

class FakeEval implements RedisEvalClient {
  calls = 0;
  readonly records = new Map<string, { w: string; c: number }>();

  constructor(private readonly behavior: 'script' | 'throw' | 'reply' = 'script') {}

  thrown: Error = new Error('Connection is closed');
  reply: unknown = null;

  async eval(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    this.calls += 1;
    if (this.behavior === 'throw') {
      throw this.thrown;
    }
    if (this.behavior === 'reply') {
      return this.reply;
    }

    const key = keys[0];
    const windowArg = args[0];
    const limit = Number(args[1]);
    const existing = this.records.get(key);
    let count = existing && existing.w === windowArg ? existing.c : 0;
    if (count >= limit) {
      return [0, count];
    }
    count += 1;
    this.records.set(key, { w: windowArg, c: count });
    return [1, count];
  }
}

const POLICY = { limit: 3, windowMs: 1000 };
const NOW = 1_700_000_000_000;

function pair(client: FakeEval = new FakeEval()): {
  sync: FixedWindowLimiter;
  asyncLimiter: AsyncFixedWindowLimiter;
  client: FakeEval;
} {
  return {
    sync: new FixedWindowLimiter(POLICY, new InMemoryStore(), new FakeClock(NOW)),
    asyncLimiter: new AsyncFixedWindowLimiter(
      POLICY,
      new RedisFixedWindowStore(client, 'tf:fw:v1', POLICY.windowMs),
      new FakeClock(NOW),
    ),
    client,
  };
}

describe('AsyncFixedWindowLimiter', () => {
  const trace = [
    { clientId: 'ip:a', atMs: NOW },
    { clientId: 'ip:a', atMs: NOW + 10 },
    { clientId: 'ip:a', atMs: NOW + 20 },
    { clientId: 'ip:a', atMs: NOW + 30 },
    { clientId: 'ip:b', atMs: NOW + 40 },
    { clientId: 'ip:a', atMs: NOW + POLICY.windowMs },
  ];

  it('matches FixedWindowLimiter decisions on the same trace', async () => {
    const { sync, asyncLimiter } = pair();
    for (const event of trace) {
      const memory = sync.consume(event.clientId, event.atMs);
      const redis = await asyncLimiter.consume(event.clientId, event.atMs);
      expect(redis).toEqual({ type: 'ok', decision: memory });
    }
  });

  it('rejects invalid policy and empty keys before EVAL', async () => {
    expect(
      () =>
        new AsyncFixedWindowLimiter(
          { limit: 0, windowMs: 1000 },
          new RedisFixedWindowStore(new FakeEval(), 'tf:fw:v1', 1000),
        ),
    ).toThrow(InvalidPolicyError);

    const client = new FakeEval();
    const limiter = new AsyncFixedWindowLimiter(
      POLICY,
      new RedisFixedWindowStore(client, 'tf:fw:v1', POLICY.windowMs),
    );
    await expect(limiter.consume('')).rejects.toBeInstanceOf(InvalidPolicyError);
    expect(client.calls).toBe(0);
  });

  it.each(['closed', 'open'] as RedisFailureMode[])(
    'returns unavailable once for a connection error when mode is %s',
    async (mode) => {
      const client = new FakeEval('throw');
      client.thrown = new Error('Connection is closed');
      const limiter = new AsyncFixedWindowLimiter(
        POLICY,
        new RedisFixedWindowStore(client, 'tf:fw:v1', POLICY.windowMs),
        new FakeClock(NOW),
        mode,
      );
      const outcome = await limiter.consume('ip:a', NOW);
      expect(outcome).toEqual({ type: 'unavailable' });
      expect(outcome).not.toHaveProperty('decision');
      expect(client.calls).toBe(1);
    },
  );

  it.each(['closed', 'open'] as RedisFailureMode[])(
    'returns unavailable once for a command timeout when mode is %s',
    async (mode) => {
      const client = new FakeEval('throw');
      client.thrown = new Error('Command timed out');
      const limiter = new AsyncFixedWindowLimiter(
        POLICY,
        new RedisFixedWindowStore(client, 'tf:fw:v1', POLICY.windowMs),
        new FakeClock(NOW),
        mode,
      );
      const outcome = await limiter.consume('ip:a', NOW);
      expect(outcome).toEqual({ type: 'unavailable' });
      expect(outcome).not.toHaveProperty('decision');
      expect(client.calls).toBe(1);
    },
  );

  it.each([null, 1, [], [1], ['x', 'y']])(
    'treats malformed reply %j as unavailable',
    async (reply) => {
      const client = new FakeEval('reply');
      client.reply = reply;
      const limiter = new AsyncFixedWindowLimiter(
        POLICY,
        new RedisFixedWindowStore(client, 'tf:fw:v1', POLICY.windowMs),
        new FakeClock(NOW),
      );
      await expect(limiter.consume('ip:a', NOW)).resolves.toEqual({
        type: 'unavailable',
      });
      expect(client.calls).toBe(1);
    },
  );

  it.each(['expire-failed', 'write-failed', 'invalid-args'])(
    'treats script error %s as unavailable for both failure modes',
    async (message) => {
      for (const mode of ['closed', 'open'] as RedisFailureMode[]) {
        const client = new FakeEval('throw');
        client.thrown = new Error(`ERR ${message}`);
        const limiter = new AsyncFixedWindowLimiter(
          POLICY,
          new RedisFixedWindowStore(client, 'tf:fw:v1', POLICY.windowMs),
          new FakeClock(NOW),
          mode,
        );
        await expect(limiter.consume('ip:a', NOW)).resolves.toEqual({
          type: 'unavailable',
        });
        expect(client.calls).toBe(1);
      }
    },
  );
});
