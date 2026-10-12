import { FakeClock } from '../../src/core/clock';
import { SlidingWindowLimiter } from '../../src/core/sliding-window.limiter';
import { SlidingWindowStore } from '../../src/core/sliding-window.store';

describe('SlidingWindowLimiter', () => {
  const windowMs = 1000;
  const limit = 3;
  const windowStart = 1_700_000_000_000;

  let clock: FakeClock;
  let store: SlidingWindowStore;
  let limiter: SlidingWindowLimiter;

  beforeEach(() => {
    clock = new FakeClock(windowStart);
    store = new SlidingWindowStore();
    limiter = new SlidingWindowLimiter({ limit, windowMs }, store, clock);
  });

  it('allows under the estimate threshold and decreases remaining', () => {
    const first = limiter.consume('ip:a');
    const second = limiter.consume('ip:a');

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);
  });

  it('allows while estimate < limit then rejects', () => {
    expect(limiter.consume('ip:a').allowed).toBe(true);
    expect(limiter.consume('ip:a').allowed).toBe(true);
    expect(limiter.consume('ip:a').allowed).toBe(true);
    const rejected = limiter.consume('ip:a');
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSec).toBeDefined();
    expect(store.getRecord('ip:a')?.currCount).toBe(3);
  });

  it('computes fractional remaining as same-now further-allow count', () => {
    // Seed prev-weighted state so estimate starts at 8.9 with limit 10.
    const L = 10;
    const swStore = new SlidingWindowStore();
    const swClock = new FakeClock(windowStart + 100);
    // elapsed=100, weight=0.9 → need prevCount * 0.9 + curr = 8.9
    // prevCount=10, curr=0 → estimate=9.0; use prev=9, curr=0 → 8.1
    // For 8.9: prevCount * weight + curr = 8.9 → with weight 0.9: prev*0.9=8.9 → prev=8.9/0.9≈9.888...
    // Simpler: set elapsed so weight known. At now=windowStart, weight=1.
    // Seed at windowStart with prev=0 and simulate via direct estimate path:
    // Use elapsed where weight makes fractional estimate.
    // At windowStart+100, weight=0.9. Want estimate=8.9: prev*0.9+curr=8.9.
    // curr=0, prev=8.9/0.9=9.888... not integer.
    // curr=8, prev=1: 1*0.9+8=8.9. Perfect.
    swStore.setRecord('ip:frac', {
      prevWindowStart: windowStart - windowMs,
      prevCount: 1,
      currWindowStart: windowStart,
      currCount: 8,
    });
    const fracLimiter = new SlidingWindowLimiter(
      { limit: L, windowMs },
      swStore,
      swClock,
    );

    const first = fracLimiter.consume('ip:frac');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = fracLimiter.consume('ip:frac');
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const third = fracLimiter.consume('ip:frac');
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('keeps independent counters per client', () => {
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    expect(limiter.consume('ip:a').allowed).toBe(false);
    expect(limiter.consume('ip:b').allowed).toBe(true);
  });

  it('rolls at the calendar boundary with weight 1', () => {
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    expect(limiter.consume('ip:a').allowed).toBe(false);

    clock.set(windowStart + windowMs);
    // After roll: prev=limit, curr=0, weight=1 → estimate=limit → reject
    const atBoundary = limiter.consume('ip:a');
    expect(atBoundary.allowed).toBe(false);
    expect(store.getRecord('ip:a')?.prevCount).toBe(limit);
    expect(store.getRecord('ip:a')?.currCount).toBe(0);
    expect(store.getRecord('ip:a')?.currWindowStart).toBe(
      windowStart + windowMs,
    );
  });

  it('allows mid-window after prev weight decays (resetAt before boundary)', () => {
    // Fill previous window to limit, then cross boundary (reject), then wait.
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    clock.set(windowStart + windowMs);
    const rejected = limiter.consume('ip:a');
    expect(rejected.allowed).toBe(false);
    expect(rejected.resetAt).toBeLessThan(windowStart + 2 * windowMs);
    expect(rejected.resetAt).toBeGreaterThan(windowStart + windowMs);

    clock.set(rejected.resetAt - 1);
    expect(limiter.consume('ip:a').allowed).toBe(false);

    clock.set(rejected.resetAt);
    expect(limiter.consume('ip:a').allowed).toBe(true);
  });

  it('uses next boundary as resetAt when only currCount blocks', () => {
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    const rejected = limiter.consume('ip:a');
    expect(rejected.allowed).toBe(false);
    expect(rejected.resetAt).toBe(windowStart + windowMs);
  });

  it('treats multi-window gaps as empty state', () => {
    limiter.consume('ip:a');
    clock.set(windowStart + 3 * windowMs);
    const afterGap = limiter.consume('ip:a');
    expect(afterGap.allowed).toBe(true);
    expect(afterGap.remaining).toBe(limit - 1);
    expect(store.getRecord('ip:a')?.prevCount).toBe(0);
    expect(store.getRecord('ip:a')?.currCount).toBe(1);
  });

  it('does not change Decision when purge removes unrelated stale peers', () => {
    store.setRecord('ip:stale', {
      prevWindowStart: windowStart - 3 * windowMs,
      prevCount: 5,
      currWindowStart: windowStart - 2 * windowMs,
      currCount: 5,
    });
    const before = limiter.consume('ip:live');
    expect(before.allowed).toBe(true);

    // Force sweeps with traffic in a later window.
    clock.set(windowStart + 2 * windowMs);
    for (let i = 0; i < 32; i++) {
      store.purgeStale(windowStart + 2 * windowMs, windowMs, 16);
    }
    expect(store.getRecord('ip:stale')).toBeUndefined();

    clock.set(windowStart);
    store.clear();
    const fresh = new SlidingWindowLimiter(
      { limit, windowMs },
      store,
      clock,
    );
    expect(fresh.consume('ip:live').remaining).toBe(limit - 1);
  });
});
