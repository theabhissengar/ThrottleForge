import { TokenBucketStore } from '../../src/core/token-bucket.store';

describe('TokenBucketStore', () => {
  const capacity = 5;
  const refillPerMs = 0.005;
  const t0 = 1_700_000_000_000;

  describe('tryConsume', () => {
    it('initializes missing keys at capacity then consumes', () => {
      const store = new TokenBucketStore();
      const r = store.tryConsume('k', t0, capacity, refillPerMs);
      expect(r.allowed).toBe(true);
      expect(r.tokens).toBe(capacity - 1);
    });

    it('refills and clamps to capacity', () => {
      const store = new TokenBucketStore();
      store.setRecord('k', { tokens: 1, lastRefillAt: t0 });
      const r = store.tryConsume('k', t0 + 10_000, capacity, refillPerMs);
      expect(r.allowed).toBe(true);
      expect(r.tokens).toBe(capacity - 1);
    });
  });

  describe('purgeStale', () => {
    it('keeps partially depleted buckets that are not yet virtually full', () => {
      const store = new TokenBucketStore();
      store.setRecord('partial', { tokens: 1, lastRefillAt: t0 });
      const result = store.purgeStale(t0, capacity, refillPerMs, 16);
      expect(store.getRecord('partial')).toBeDefined();
      expect(result.deleted).toBe(0);
    });

    it('deletes when virtual refill reaches capacity', () => {
      const store = new TokenBucketStore();
      store.setRecord('idle', { tokens: 0, lastRefillAt: t0 });
      // Need elapsed * refillPerMs >= capacity → elapsed >= capacity/refillPerMs
      const now = t0 + Math.ceil(capacity / refillPerMs);
      let guard = 0;
      while (store.getRecord('idle') && guard < 10) {
        store.purgeStale(now, capacity, refillPerMs, 16);
        guard += 1;
      }
      expect(store.getRecord('idle')).toBeUndefined();
    });

    it('respects maxInspect budget', () => {
      const store = new TokenBucketStore();
      for (let i = 0; i < 10; i++) {
        store.setRecord(`k-${i}`, { tokens: 0, lastRefillAt: t0 });
      }
      const now = t0 + Math.ceil(capacity / refillPerMs);
      const result = store.purgeStale(now, capacity, refillPerMs, 3);
      expect(result.inspected).toBeLessThanOrEqual(3);
    });

    it('returns zeros for invalid maxInspect', () => {
      const store = new TokenBucketStore();
      expect(store.purgeStale(t0, capacity, refillPerMs, 0)).toEqual({
        inspected: 0,
        deleted: 0,
      });
    });
  });
});
