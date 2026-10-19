import { InvalidPolicyError } from './errors';

/**
 * Pure limit controller. It does not read a clock, store, or plant.
 * The caller supplies the completed-window signal.
 */
export interface AdaptiveConfig {
  floor: number;
  ceiling: number;
  initial: number;
}

export interface AdaptiveState {
  limit: number;
  hold: boolean;
  nextIndex: number;
}

export type AdaptiveSignal =
  | { available: false }
  | { available: true; congested: boolean; saturated: boolean };

export interface AdaptiveUpdate {
  windowIndex: number;
  signal: AdaptiveSignal;
}

export interface ApplyResult {
  state: AdaptiveState;
  status: 'applied' | 'ignored';
}

function assertInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InvalidPolicyError(`${name} must be an integer`);
  }
}

function assertConfig(config: AdaptiveConfig): void {
  if (config == null || typeof config !== 'object') {
    throw new InvalidPolicyError('config must be an object');
  }
  assertInteger(config.floor, 'floor');
  assertInteger(config.ceiling, 'ceiling');
  assertInteger(config.initial, 'initial');
  if (config.floor < 1) {
    throw new InvalidPolicyError('floor must be an integer >= 1');
  }
  if (config.ceiling < config.floor) {
    throw new InvalidPolicyError('ceiling must be an integer >= floor');
  }
  if (config.initial < config.floor || config.initial > config.ceiling) {
    throw new InvalidPolicyError(
      'initial must be an integer in [floor, ceiling]',
    );
  }
}

function assertState(config: AdaptiveConfig, state: AdaptiveState): void {
  if (state == null || typeof state !== 'object') {
    throw new InvalidPolicyError('state must be an object');
  }
  assertInteger(state.limit, 'limit');
  if (state.limit < config.floor || state.limit > config.ceiling) {
    throw new InvalidPolicyError(
      'limit must be an integer in [floor, ceiling]',
    );
  }
  if (typeof state.hold !== 'boolean') {
    throw new InvalidPolicyError('hold must be a boolean');
  }
  assertInteger(state.nextIndex, 'nextIndex');
  if (state.nextIndex < 0) {
    throw new InvalidPolicyError('nextIndex must be an integer >= 0');
  }
}

function assertUpdate(update: AdaptiveUpdate): void {
  if (update == null || typeof update !== 'object') {
    throw new InvalidPolicyError('update must be an object');
  }
  assertInteger(update.windowIndex, 'windowIndex');
  if (update.windowIndex < 0) {
    throw new InvalidPolicyError('windowIndex must be an integer >= 0');
  }
  const signal = update.signal;
  if (signal == null || typeof signal !== 'object') {
    throw new InvalidPolicyError('signal must be an object');
  }
  if (typeof signal.available !== 'boolean') {
    throw new InvalidPolicyError('available must be a boolean');
  }
  if (signal.available) {
    if (typeof signal.congested !== 'boolean') {
      throw new InvalidPolicyError('congested must be a boolean');
    }
    if (typeof signal.saturated !== 'boolean') {
      throw new InvalidPolicyError('saturated must be a boolean');
    }
  }
}

function nextFromSignal(
  config: AdaptiveConfig,
  state: AdaptiveState,
  signal: AdaptiveSignal,
): AdaptiveState {
  const nextIndex = state.nextIndex + 1;
  if (!signal.available) {
    return { limit: state.limit, hold: state.hold, nextIndex };
  }
  if (signal.congested) {
    return {
      limit: Math.max(config.floor, Math.floor(state.limit / 2)),
      hold: true,
      nextIndex,
    };
  }
  if (state.hold) {
    return { limit: state.limit, hold: false, nextIndex };
  }
  if (!signal.saturated) {
    return { limit: state.limit, hold: false, nextIndex };
  }
  return {
    limit: Math.min(config.ceiling, state.limit + 1),
    hold: false,
    nextIndex,
  };
}

export function createAdaptiveState(config: AdaptiveConfig): AdaptiveState {
  assertConfig(config);
  return { limit: config.initial, hold: false, nextIndex: 0 };
}

/**
 * Apply one completed-window update.
 * Config, then state, then update. Invalid state throws before a duplicate
 * index can be ignored. Applied results are new objects. Ignored results
 * return the same state object.
 */
export function applyAdaptiveUpdate(
  config: AdaptiveConfig,
  state: AdaptiveState,
  update: AdaptiveUpdate,
): ApplyResult {
  assertConfig(config);
  assertState(config, state);
  assertUpdate(update);

  if (update.windowIndex < state.nextIndex) {
    return { state, status: 'ignored' };
  }
  if (update.windowIndex > state.nextIndex) {
    throw new InvalidPolicyError(
      `windowIndex ${update.windowIndex} skips ${state.nextIndex}`,
    );
  }

  return {
    state: nextFromSignal(config, state, update.signal),
    status: 'applied',
  };
}
