import { InMemoryStore } from '../../src/core/in-memory.store';

describe('InMemoryStore', () => {
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
