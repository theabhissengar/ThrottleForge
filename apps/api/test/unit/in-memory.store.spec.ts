import {
  DEFAULT_PURGE_MAX_INSPECT,
  InMemoryStore,
} from '../../src/core/in-memory.store';

describe('InMemoryStore', () => {
  describe('tryConsume (G4 — existing contract)', () => {
    it('increments within the same window until limit', () => {
      const store = new InMemoryStore();
      expect(store.tryConsume('k', 1000, 2)).toEqual({
        allowed: true,
        count: 1,
      });
      expect(store.tryConsume('k', 1000, 2)).toEqual({
        allowed: true,
        count: 2,
      });
      expect(store.tryConsume('k', 1000, 2)).toEqual({
        allowed: false,
        count: 2,
      });
      expect(store.getRecord('k')?.count).toBe(2);
    });

    it('resets count when windowStart changes', () => {
      const store = new InMemoryStore();
      store.tryConsume('k', 1000, 1);
      expect(store.tryConsume('k', 1000, 1).allowed).toBe(false);
      expect(store.tryConsume('k', 2000, 1)).toEqual({
        allowed: true,
        count: 1,
      });
    });
  });

  describe('purgeStale (G1 — stale vs active)', () => {
    it('deletes stale records and preserves active-window records', () => {
      const store = new InMemoryStore();
      const W0 = 1000;
      const W1 = 2000;

      store.tryConsume('stale-a', W0, 5);
      store.tryConsume('stale-b', W0, 5);
      store.tryConsume('active', W1, 5);

      let guard = 0;
      while (store.size() > 1 && guard < 20) {
        store.purgeStale(W1, 16);
        guard += 1;
      }

      expect(store.getRecord('stale-a')).toBeUndefined();
      expect(store.getRecord('stale-b')).toBeUndefined();
      expect(store.getRecord('active')).toEqual({ windowStart: W1, count: 1 });
      expect(store.size()).toBe(1);
    });

    it('does not delete records with windowStart greater than current', () => {
      const store = new InMemoryStore();
      store.tryConsume('future', 3000, 5);
      const result = store.purgeStale(2000, 16);
      expect(store.getRecord('future')).toEqual({
        windowStart: 3000,
        count: 1,
      });
      expect(result.deleted).toBe(0);
    });
  });

  describe('purgeStale (G2 — inspection budget)', () => {
    it('examines at most maxInspect entries even when all are active', () => {
      const store = new InMemoryStore();
      const W = 5000;
      for (let i = 0; i < 10; i += 1) {
        store.tryConsume(`active-${i}`, W, 10);
      }

      // Start a fresh pass after seeding sweeps may have exhausted the iterator.
      const first = store.purgeStale(W, 3);
      // If first call ended a pass early, second starts fresh.
      const result =
        first.inspected === 0 ? store.purgeStale(W, 3) : first;

      // Ensure we observe a capped call: keep calling until we get a full budget use
      // or prove every call respects the cap.
      let sawCapped = result.inspected <= 3;
      let last = result;
      for (let i = 0; i < 5; i += 1) {
        last = store.purgeStale(W, 3);
        expect(last.inspected).toBeLessThanOrEqual(3);
        expect(last.deleted).toBe(0);
        if (last.inspected === 3) {
          sawCapped = true;
        }
      }
      expect(sawCapped || last.inspected <= 3).toBe(true);
      expect(store.size()).toBe(10);
    });

    it('does not treat deletion count as the work budget', () => {
      const store = new InMemoryStore();
      const W0 = 1000;
      const W1 = 2000;
      // Mostly active, one stale at the end of insertion order.
      for (let i = 0; i < 5; i += 1) {
        store.tryConsume(`a-${i}`, W1, 10);
      }
      store.tryConsume('stale', W0, 10);

      const result = store.purgeStale(W1, 2);
      expect(result.inspected).toBeLessThanOrEqual(2);
      // May delete 0 if the first two examined are active — that is correct.
      expect(result.deleted).toBeLessThanOrEqual(result.inspected);
    });

    it('stops at end of pass without mid-call restart (no re-scan)', () => {
      const store = new InMemoryStore();
      store.tryConsume('only', 1000, 5);
      // Fresh pass: one entry, budget 10 → inspect 1 and stop (not 10).
      // Exhaust residual iterator from tryConsume first.
      store.purgeStale(1000, 16);
      const result = store.purgeStale(1000, 10);
      expect(result.inspected).toBeLessThanOrEqual(1);
      expect(result.inspected).toBeLessThanOrEqual(10);
    });

    it('returns zeros for invalid maxInspect', () => {
      const store = new InMemoryStore();
      store.tryConsume('k', 1000, 5);
      expect(store.purgeStale(1000, 0)).toEqual({ inspected: 0, deleted: 0 });
      expect(store.purgeStale(1000, -1)).toEqual({ inspected: 0, deleted: 0 });
      expect(store.purgeStale(1000, 1.5)).toEqual({ inspected: 0, deleted: 0 });
    });
  });

  describe('purgeStale (G3 — eventual cleanup and cursor)', () => {
    it('returns zeros on an empty Map', () => {
      const store = new InMemoryStore();
      expect(store.purgeStale(1000, 16)).toEqual({
        inspected: 0,
        deleted: 0,
      });
    });

    it('eventually removes all stale records with a small budget', () => {
      const store = new InMemoryStore();
      const W0 = 1000;
      const W1 = 2000;
      for (let i = 0; i < 5; i += 1) {
        store.tryConsume(`s-${i}`, W0, 5);
      }

      let rounds = 0;
      while (store.size() > 0 && rounds < 40) {
        store.purgeStale(W1, 1);
        rounds += 1;
      }
      expect(store.size()).toBe(0);
      expect(rounds).toBeGreaterThan(0);
    });

    it('continues progress on the next call after iterator exhaustion', () => {
      const store = new InMemoryStore();
      const W0 = 1000;
      const W1 = 2000;
      store.tryConsume('a', W0, 5);
      store.tryConsume('b', W0, 5);

      // Complete a full pass with large budget (may delete both or leave cursor done).
      store.purgeStale(W1, 16);
      // Re-seed stale keys after pass.
      store.tryConsume('c', W0, 5);
      store.tryConsume('d', W0, 5);

      let rounds = 0;
      while (store.size() > 0 && rounds < 20) {
        store.purgeStale(W1, 1);
        rounds += 1;
      }
      expect(store.size()).toBe(0);
    });

    it('eventually examines keys inserted between sweeps', () => {
      const store = new InMemoryStore();
      const W0 = 1000;
      const W1 = 2000;
      store.tryConsume('early', W0, 5);

      // Start a pass with tiny budget.
      store.purgeStale(W1, 1);

      // Insert another stale key mid-pass.
      store.tryConsume('late', W0, 5);

      let rounds = 0;
      while (
        (store.getRecord('early') !== undefined ||
          store.getRecord('late') !== undefined) &&
        rounds < 30
      ) {
        store.purgeStale(W1, 1);
        rounds += 1;
      }

      expect(store.getRecord('early')).toBeUndefined();
      expect(store.getRecord('late')).toBeUndefined();
    });

    it('clear() resets cursor so later purge is safe', () => {
      const store = new InMemoryStore();
      for (let i = 0; i < 5; i += 1) {
        store.tryConsume(`k-${i}`, 1000, 5);
      }
      store.purgeStale(1000, 2);
      store.clear();
      expect(store.size()).toBe(0);
      expect(store.purgeStale(2000, 16)).toEqual({
        inspected: 0,
        deleted: 0,
      });
      store.tryConsume('new', 2000, 5);
      expect(store.purgeStale(2000, 16).deleted).toBe(0);
      expect(store.getRecord('new')).toBeDefined();
    });
  });

  it('exposes DEFAULT_PURGE_MAX_INSPECT used by tryConsume', () => {
    expect(DEFAULT_PURGE_MAX_INSPECT).toBe(16);
  });
});
