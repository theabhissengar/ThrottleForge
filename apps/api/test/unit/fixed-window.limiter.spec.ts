import { FakeClock } from '../../src/core/clock';
import { FixedWindowLimiter } from '../../src/core/fixed-window.limiter';
import { InMemoryStore } from '../../src/core/in-memory.store';

describe('FixedWindowLimiter', () => {
  const windowMs = 1000;
  const limit = 3;
  // Align to a clean calendar window for readable assertions.
  const windowStart = 1_700_000_000_000;

  let clock: FakeClock;
  let store: InMemoryStore;
  let limiter: FixedWindowLimiter;

  beforeEach(() => {
    clock = new FakeClock(windowStart);
    store = new InMemoryStore();
    limiter = new FixedWindowLimiter({ limit, windowMs }, store, clock);
  });

  it('allows requests under the limit and decreases remaining', () => {
    const first = limiter.consume('ip:a');
    const second = limiter.consume('ip:a');

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);
  });

  it('allows exactly limit requests then rejects the next', () => {
    const results = [
      limiter.consume('ip:a'),
      limiter.consume('ip:a'),
      limiter.consume('ip:a'),
      limiter.consume('ip:a'),
    ];

    expect(results.slice(0, 3).every((d) => d.allowed)).toBe(true);
    expect(results[2].remaining).toBe(0);
    expect(results[3].allowed).toBe(false);
    expect(results[3].remaining).toBe(0);
    expect(results[3].retryAfterSec).toBeDefined();
    expect(store.getRecord('ip:a')?.count).toBe(3);
  });

  it('keeps independent counters per client', () => {
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    expect(limiter.consume('ip:a').allowed).toBe(false);
    expect(limiter.consume('ip:b').allowed).toBe(true);
  });

  it('resets after the window expires via fake clock', () => {
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    expect(limiter.consume('ip:a').allowed).toBe(false);

    clock.advance(windowMs);
    const after = limiter.consume('ip:a');
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(limit - 1);
  });

  it('opens a new window at exactly resetAt', () => {
    limiter.consume('ip:a');
    const resetAt = windowStart + windowMs;
    clock.set(resetAt);

    const decision = limiter.consume('ip:a');
    expect(decision.allowed).toBe(true);
    expect(decision.resetAt).toBe(resetAt + windowMs);
    expect(store.getRecord('ip:a')?.windowStart).toBe(resetAt);
    expect(store.getRecord('ip:a')?.count).toBe(1);
  });

  it('rejects at resetAt-1 when saturated then allows at resetAt', () => {
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    const resetAt = windowStart + windowMs;

    clock.set(resetAt - 1);
    const before = limiter.consume('ip:a');
    expect(before.allowed).toBe(false);
    expect(store.getRecord('ip:a')?.count).toBe(limit);
    expect(store.getRecord('ip:a')?.windowStart).toBe(windowStart);

    clock.set(resetAt);
    const atBoundary = limiter.consume('ip:a');
    expect(atBoundary.allowed).toBe(true);
    expect(store.getRecord('ip:a')?.windowStart).toBe(resetAt);
    expect(store.getRecord('ip:a')?.count).toBe(1);
  });

  it('computes Retry-After in whole seconds on reject', () => {
    for (let i = 0; i < limit; i++) {
      limiter.consume('ip:a');
    }
    clock.set(windowStart + 250);
    const rejected = limiter.consume('ip:a');
    expect(rejected.allowed).toBe(false);
    // Remaining window: 750ms -> ceil to 1 second.
    expect(rejected.retryAfterSec).toBe(1);
  });
});
