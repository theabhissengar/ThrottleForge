import { InvalidPolicyError } from '../../src/core/errors';
import {
  AdaptiveConfig,
  AdaptiveState,
  AdaptiveUpdate,
  applyAdaptiveUpdate,
  createAdaptiveState,
} from '../../src/core/adaptive-policy';

const CONFIG: AdaptiveConfig = { floor: 1, ceiling: 32, initial: 1 };

function healthy(saturated: boolean): AdaptiveUpdate['signal'] {
  return { available: true, congested: false, saturated };
}

function congested(): AdaptiveUpdate['signal'] {
  return { available: true, congested: true, saturated: true };
}

function snapshot(state: AdaptiveState): AdaptiveState {
  return { limit: state.limit, hold: state.hold, nextIndex: state.nextIndex };
}

describe('createAdaptiveState', () => {
  it('returns the initial limit with hold clear and nextIndex 0', () => {
    expect(createAdaptiveState(CONFIG)).toEqual({
      limit: 1,
      hold: false,
      nextIndex: 0,
    });
  });

  it('rejects non-integer, non-finite, and out-of-range config', () => {
    const invalid: AdaptiveConfig[] = [
      { floor: 1.5, ceiling: 32, initial: 1 },
      { floor: NaN, ceiling: 32, initial: 1 },
      { floor: Infinity, ceiling: 32, initial: 1 },
      { floor: 0, ceiling: 32, initial: 1 },
      { floor: 2, ceiling: 1, initial: 2 },
      { floor: 1, ceiling: 32, initial: 0 },
      { floor: 1, ceiling: 32, initial: 33 },
    ];
    for (const config of invalid) {
      expect(() => createAdaptiveState(config)).toThrow(InvalidPolicyError);
    }
  });
});

describe('applyAdaptiveUpdate', () => {
  it('lets the first update change the initial limit', () => {
    const state = createAdaptiveState(CONFIG);
    const result = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: 0,
      signal: healthy(true),
    });
    expect(result.status).toBe('applied');
    expect(result.state).toEqual({ limit: 2, hold: false, nextIndex: 1 });
  });

  it('increases when saturated and holds when the budget is not binding', () => {
    const state: AdaptiveState = { limit: 4, hold: false, nextIndex: 3 };
    const increased = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: 3,
      signal: healthy(true),
    });
    expect(increased.state.limit).toBe(5);

    const held = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: 3,
      signal: healthy(false),
    });
    expect(held.state).toEqual({ limit: 4, hold: false, nextIndex: 4 });
  });

  it('halves on congestion and still sets hold at the floor', () => {
    const halved = applyAdaptiveUpdate(
      CONFIG,
      { limit: 5, hold: false, nextIndex: 4 },
      { windowIndex: 4, signal: congested() },
    );
    expect(halved.state).toEqual({ limit: 2, hold: true, nextIndex: 5 });

    const atFloor = applyAdaptiveUpdate(
      CONFIG,
      { limit: 1, hold: false, nextIndex: 0 },
      { windowIndex: 0, signal: congested() },
    );
    expect(atFloor.state).toEqual({ limit: 1, hold: true, nextIndex: 1 });
  });

  it('consumes a one-window hold, then allows a later increase', () => {
    const afterDecrease = applyAdaptiveUpdate(
      CONFIG,
      { limit: 8, hold: false, nextIndex: 0 },
      { windowIndex: 0, signal: congested() },
    );
    expect(afterDecrease.state).toEqual({
      limit: 4,
      hold: true,
      nextIndex: 1,
    });

    const consumed = applyAdaptiveUpdate(CONFIG, afterDecrease.state, {
      windowIndex: 1,
      signal: healthy(true),
    });
    expect(consumed.state).toEqual({ limit: 4, hold: false, nextIndex: 2 });

    const increased = applyAdaptiveUpdate(CONFIG, consumed.state, {
      windowIndex: 2,
      signal: healthy(true),
    });
    expect(increased.state.limit).toBe(5);
  });

  it('refreshes hold when congestion arrives during a hold', () => {
    const result = applyAdaptiveUpdate(
      CONFIG,
      { limit: 8, hold: true, nextIndex: 1 },
      { windowIndex: 1, signal: congested() },
    );
    expect(result.state).toEqual({ limit: 4, hold: true, nextIndex: 2 });
  });

  it('freezes limit and hold when the signal is unavailable', () => {
    const state: AdaptiveState = { limit: 4, hold: true, nextIndex: 2 };
    const before = snapshot(state);
    const result = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: 2,
      signal: { available: false },
    });
    expect(result.status).toBe('applied');
    expect(result.state).not.toBe(state);
    expect(result.state).toEqual({ limit: 4, hold: true, nextIndex: 3 });
    expect(state).toEqual(before);
  });

  it('clamps an increase at the ceiling', () => {
    const state: AdaptiveState = { limit: 32, hold: false, nextIndex: 0 };
    const result = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: 0,
      signal: healthy(true),
    });
    expect(result.state).toEqual({ limit: 32, hold: false, nextIndex: 1 });
    expect(result.state).not.toBe(state);
  });

  it('returns the same state object for a duplicate or stale index', () => {
    const state: AdaptiveState = { limit: 3, hold: false, nextIndex: 0 };
    const first = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: 0,
      signal: healthy(true),
    });
    const duplicate = applyAdaptiveUpdate(CONFIG, first.state, {
      windowIndex: 0,
      signal: congested(),
    });
    expect(duplicate.status).toBe('ignored');
    expect(duplicate.state).toBe(first.state);
    expect(first.state).toEqual({ limit: 4, hold: false, nextIndex: 1 });

    const later: AdaptiveState = { limit: 3, hold: true, nextIndex: 4 };
    const before = snapshot(later);
    const stale = applyAdaptiveUpdate(CONFIG, later, {
      windowIndex: 1,
      signal: healthy(true),
    });
    expect(stale.status).toBe('ignored');
    expect(stale.state).toBe(later);
    expect(later).toEqual(before);
  });

  it('does not mutate the input on an applied increase or an unavailable update', () => {
    const increaseInput: AdaptiveState = {
      limit: 4,
      hold: false,
      nextIndex: 1,
    };
    const increaseBefore = snapshot(increaseInput);
    const increased = applyAdaptiveUpdate(CONFIG, increaseInput, {
      windowIndex: 1,
      signal: healthy(true),
    });
    expect(increased.state).not.toBe(increaseInput);
    expect(increaseInput).toEqual(increaseBefore);
    expect(increased.state.limit).toBe(5);

    const frozen: AdaptiveState = { limit: 4, hold: true, nextIndex: 1 };
    const frozenBefore = snapshot(frozen);
    const unavailable = applyAdaptiveUpdate(CONFIG, frozen, {
      windowIndex: 1,
      signal: { available: false },
    });
    expect(unavailable.state).not.toBe(frozen);
    expect(frozen).toEqual(frozenBefore);
  });

  it('rejects an invalid state and leaves its fields unchanged', () => {
    const cases: AdaptiveState[] = [
      { limit: 0, hold: false, nextIndex: 0 },
      { limit: 33, hold: false, nextIndex: 0 },
      { limit: 1.5, hold: false, nextIndex: 0 },
      { limit: 4, hold: 1 as unknown as boolean, nextIndex: 0 },
      { limit: 4, hold: false, nextIndex: -1 },
      { limit: 4, hold: false, nextIndex: 1.5 },
    ];
    for (const state of cases) {
      const before = snapshot(state);
      expect(() =>
        applyAdaptiveUpdate(CONFIG, state, {
          windowIndex: 0,
          signal: healthy(true),
        }),
      ).toThrow(InvalidPolicyError);
      expect(state).toEqual(before);
    }
  });

  it('throws an invalid state even when the window index is stale', () => {
    const state: AdaptiveState = { limit: 0, hold: false, nextIndex: 3 };
    const before = snapshot(state);
    expect(() =>
      applyAdaptiveUpdate(CONFIG, state, {
        windowIndex: 1,
        signal: healthy(true),
      }),
    ).toThrow(InvalidPolicyError);
    expect(state).toEqual(before);
  });

  it('throws when the window index skips ahead', () => {
    const state = createAdaptiveState(CONFIG);
    const before = snapshot(state);
    expect(() =>
      applyAdaptiveUpdate(CONFIG, state, {
        windowIndex: 2,
        signal: healthy(true),
      }),
    ).toThrow(InvalidPolicyError);
    expect(state).toEqual(before);
  });

  it('returns deep-equal results for the same inputs', () => {
    const state = createAdaptiveState(CONFIG);
    const update: AdaptiveUpdate = {
      windowIndex: 0,
      signal: healthy(true),
    };
    expect(applyAdaptiveUpdate(CONFIG, state, update)).toEqual(
      applyAdaptiveUpdate(CONFIG, state, update),
    );
  });
});
