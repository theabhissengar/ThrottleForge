import { FakeClock } from '../../src/core/clock';
import { FixedWindowLimiter } from '../../src/core/fixed-window.limiter';
import { InMemoryStore } from '../../src/core/in-memory.store';

/**
 * Concurrent Promise.all still schedules JS callbacks on one event loop.
 * Because consume() is fully synchronous, each call completes before the next
 * starts — so allowed count must be exactly the limit (not merely <=).
 */
describe('FixedWindowLimiter concurrency (sync critical section)', () => {
  it('never allows more than limit under parallel consume calls', async () => {
    const limit = 50;
    const clock = new FakeClock(1_700_000_000_000);
    const store = new InMemoryStore();
    const limiter = new FixedWindowLimiter(
      { limit, windowMs: 60_000 },
      store,
      clock,
    );

    const burst = 500;
    const decisions = await Promise.all(
      Array.from({ length: burst }, () =>
        Promise.resolve().then(() => limiter.consume('ip:burst')),
      ),
    );

    const allowed = decisions.filter((d) => d.allowed).length;
    const rejected = decisions.filter((d) => !d.allowed).length;

    expect(allowed).toBe(limit);
    expect(rejected).toBe(burst - limit);
    expect(store.getRecord('ip:burst')?.count).toBe(limit);
  });
});
