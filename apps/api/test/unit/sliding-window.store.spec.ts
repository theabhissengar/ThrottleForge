import { SlidingWindowStore } from '../../src/core/sliding-window.store';

describe('SlidingWindowStore', () => {
  const windowMs = 1000;
  const C = 1_700_000_000_000;

  describe('tryConsume', () => {
    it('increments curr until estimate reaches limit', () => {
      const store = new SlidingWindowStore();
      expect(store.tryConsume('k', C, windowMs, 2).allowed).toBe(true);
      expect(store.tryConsume('k', C, windowMs, 2).allowed).toBe(true);
      expect(store.tryConsume('k', C, windowMs, 2).allowed).toBe(false);
      expect(store.getRecord('k')?.currCount).toBe(2);
    });

    it('rolls previous window into prevCount', () => {
      const store = new SlidingWindowStore();
      store.tryConsume('k', C, windowMs, 5);
      store.tryConsume('k', C, windowMs, 5);
      const next = store.tryConsume('k', C + windowMs, windowMs, 5);
      expect(next.allowed).toBe(true);
      expect(store.getRecord('k')).toEqual({
        prevWindowStart: C,
        prevCount: 2,
        currWindowStart: C + windowMs,
        currCount: 1,
      });
    });
  });

  describe('purgeStale', () => {
    it('retains current and previous calendar windows', () => {
      const store = new SlidingWindowStore();
      store.setRecord('curr', {
        prevWindowStart: C - windowMs,
        prevCount: 1,
        currWindowStart: C,
        currCount: 2,
      });
      store.setRecord('prev-only', {
        prevWindowStart: C - 2 * windowMs,
        prevCount: 1,
        currWindowStart: C - windowMs,
        currCount: 3,
      });
      store.setRecord('stale', {
        prevWindowStart: C - 3 * windowMs,
        prevCount: 1,
        currWindowStart: C - 2 * windowMs,
        currCount: 4,
      });

      let guard = 0;
      while (store.getRecord('stale') && guard < 20) {
        store.purgeStale(C, windowMs, 16);
        guard += 1;
      }

      expect(store.getRecord('curr')).toBeDefined();
      expect(store.getRecord('prev-only')).toBeDefined();
      expect(store.getRecord('stale')).toBeUndefined();
    });

    it('respects maxInspect budget', () => {
      const store = new SlidingWindowStore();
      for (let i = 0; i < 10; i++) {
        store.setRecord(`k-${i}`, {
          prevWindowStart: C - windowMs,
          prevCount: 0,
          currWindowStart: C,
          currCount: 1,
        });
      }
      const result = store.purgeStale(C, windowMs, 3);
      expect(result.inspected).toBeLessThanOrEqual(3);
    });

    it('returns zeros for invalid maxInspect', () => {
      const store = new SlidingWindowStore();
      expect(store.purgeStale(C, windowMs, 0)).toEqual({
        inspected: 0,
        deleted: 0,
      });
    });
  });
});
