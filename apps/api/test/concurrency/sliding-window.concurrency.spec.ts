import { FakeClock } from '../../src/core/clock';
import { SlidingWindowLimiter } from '../../src/core/sliding-window.limiter';
import { SlidingWindowStore } from '../../src/core/sliding-window.store';

describe('SlidingWindowLimiter concurrency (sync critical section)', () => {
  it('never allows more than limit under parallel consume calls', async () => {
    const limit = 50;
    const clock = new FakeClock(1_700_000_000_000);
    const store = new SlidingWindowStore();
    const limiter = new SlidingWindowLimiter(
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
    expect(allowed).toBe(limit);
    expect(store.getRecord('ip:burst')?.currCount).toBe(limit);
  });
});
