import { FakeClock } from '../../src/core/clock';
import { TokenBucketLimiter } from '../../src/core/token-bucket.limiter';
import { TokenBucketStore } from '../../src/core/token-bucket.store';
import { tokenBucketFromWindow } from '../../src/core/policy';

describe('TokenBucketLimiter', () => {
  const capacity = 3;
  const refillPerMs = 0.003; // 3 tokens / 1000ms
  const t0 = 1_700_000_000_000;

  let clock: FakeClock;
  let store: TokenBucketStore;
  let limiter: TokenBucketLimiter;

  beforeEach(() => {
    clock = new FakeClock(t0);
    store = new TokenBucketStore();
    limiter = new TokenBucketLimiter(
      { capacity, refillPerMs },
      store,
      clock,
    );
  });

  it('allows under capacity and reports floor(remaining)', () => {
    const first = limiter.consume('ip:a');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    expect(first.limit).toBe(capacity);
  });

  it('rejects when tokens < 1 and sets resetAt/retryAfterSec', () => {
    for (let i = 0; i < capacity; i++) {
      expect(limiter.consume('ip:a').allowed).toBe(true);
    }
    const rejected = limiter.consume('ip:a');
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.resetAt).toBe(
      Math.ceil(t0 + (1 - 0) / refillPerMs),
    );
    expect(rejected.retryAfterSec).toBe(
      Math.max(0, Math.ceil((rejected.resetAt - t0) / 1000)),
    );
  });

  it('handles fractional balances without premature rounding', () => {
    store.setRecord('ip:a', { tokens: 1.25, lastRefillAt: t0 });
    const allowed = limiter.consume('ip:a');
    expect(allowed.allowed).toBe(true);
    expect(store.getRecord('ip:a')?.tokens).toBeCloseTo(0.25, 10);
    expect(allowed.remaining).toBe(0);

    const rejected = limiter.consume('ip:a');
    expect(rejected.allowed).toBe(false);
  });

  it('allows at tokens === 1 and rejects just below 1', () => {
    store.setRecord('ip:a', { tokens: 1, lastRefillAt: t0 });
    expect(limiter.consume('ip:a').allowed).toBe(true);

    store.setRecord('ip:b', { tokens: 0.99, lastRefillAt: t0 });
    expect(limiter.consume('ip:b').allowed).toBe(false);
  });

  it('refills with clamp to capacity via FakeClock', () => {
    for (let i = 0; i < capacity; i++) {
      limiter.consume('ip:a');
    }
    expect(limiter.consume('ip:a').allowed).toBe(false);

    clock.advance(1000);
    const after = limiter.consume('ip:a');
    expect(after.allowed).toBe(true);
    // refilled to capacity then consumed one
    expect(store.getRecord('ip:a')?.tokens).toBeCloseTo(capacity - 1, 10);
  });

  it('rejects at resetAt-1 and allows at resetAt', () => {
    for (let i = 0; i < capacity; i++) {
      limiter.consume('ip:a');
    }
    const rejected = limiter.consume('ip:a');
    expect(rejected.allowed).toBe(false);
    const { resetAt } = rejected;

    clock.set(resetAt - 1);
    const stillRejected = limiter.consume('ip:a');
    expect(stillRejected.allowed).toBe(false);
    expect(stillRejected.remaining).toBe(0);
    expect(stillRejected.retryAfterSec).toBe(
      Math.max(0, Math.ceil((stillRejected.resetAt - (resetAt - 1)) / 1000)),
    );

    clock.set(resetAt);
    expect(limiter.consume('ip:a').allowed).toBe(true);
  });

  it('does not grant refill credit when clock moves backward', () => {
    limiter.consume('ip:a');
    const mid = store.getRecord('ip:a')!.tokens;
    clock.set(t0 - 5000);
    limiter.consume('ip:a');
    expect(store.getRecord('ip:a')!.tokens).toBeCloseTo(mid - 1, 10);
  });

  it('drains without refill on the same timestamp', () => {
    const d1 = limiter.consume('ip:a');
    const d2 = limiter.consume('ip:a');
    const d3 = limiter.consume('ip:a');
    const d4 = limiter.consume('ip:a');
    expect([d1, d2, d3].every((d) => d.allowed)).toBe(true);
    expect(d4.allowed).toBe(false);
  });

  it('starts missing keys at full capacity', () => {
    const d = limiter.consume('ip:new');
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(capacity - 1);
  });

  it('keeps independent buckets per client', () => {
    for (let i = 0; i < capacity; i++) {
      limiter.consume('ip:a');
    }
    expect(limiter.consume('ip:a').allowed).toBe(false);
    expect(limiter.consume('ip:b').allowed).toBe(true);
  });

  it('accepts tokenBucketFromWindow mapping', () => {
    const policy = tokenBucketFromWindow({ limit: 5, windowMs: 1000 });
    const mapped = new TokenBucketLimiter(policy, new TokenBucketStore(), clock);
    for (let i = 0; i < 5; i++) {
      expect(mapped.consume('ip:a').allowed).toBe(true);
    }
    expect(mapped.consume('ip:a').allowed).toBe(false);
  });
});
