import { FakeClock } from '../../src/core/clock';
import { TokenBucketLimiter } from '../../src/core/token-bucket.limiter';
import { TokenBucketStore } from '../../src/core/token-bucket.store';

describe('TokenBucketLimiter concurrency (sync critical section)', () => {
  it('never allows more than capacity under parallel consume calls', async () => {
    const capacity = 50;
    const clock = new FakeClock(1_700_000_000_000);
    const store = new TokenBucketStore();
    const limiter = new TokenBucketLimiter(
      { capacity, refillPerMs: capacity / 60_000 },
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
    expect(allowed).toBe(capacity);
  });
});
