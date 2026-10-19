/**
 * Milestone 6 global-budget comparison.
 *
 * One ordered trace per scenario is replayed from fresh state for an adaptive
 * controller, static floor, static ceiling, a static oracle, and a per-client
 * fixed-window reference. The plant capacity stays in this file. The controller
 * receives only a boolean congestion signal.
 *
 * Example:
 *   npm run load:adaptive
 */

import {
  applyAdaptiveUpdate,
  calendarWindowStart,
  createAdaptiveState,
  FakeClock,
  fixedWindowDecision,
  FixedWindowLimiter,
  InMemoryStore,
  AdaptiveState,
} from '../../apps/api/src/core';

const BASE = 1_700_000_000_000;
const WINDOW_MS = 1000;
const FLOOR = 1;
const INITIAL = 1;
const CEILING = 32;
const GLOBAL_KEY = 'global';
const PER_CLIENT_REFERENCE_LIMIT = 8;
const CONFIG = { floor: FLOOR, ceiling: CEILING, initial: INITIAL };

type ScenarioId =
  | 'steady'
  | 'burst'
  | 'sustained-overload'
  | 'recovery'
  | 'capacity-change'
  | 'mixed';

type RunnerId =
  | 'adaptive'
  | 'static-floor'
  | 'static-ceiling'
  | 'static-oracle'
  | 'per-client-fixed-window-reference';

type OutcomeName = 'increase' | 'decrease' | 'hold';

interface TraceEvent {
  clientId: string;
  atMs: number;
}

const PASS_SET: readonly ScenarioId[] = [
  'steady',
  'burst',
  'sustained-overload',
  'recovery',
  'capacity-change',
];

const SCENARIOS: readonly ScenarioId[] = [...PASS_SET, 'mixed'];

const HAND_REGRET: Record<
  'adaptive' | 'static-floor' | 'static-ceiling' | 'static-oracle',
  Record<(typeof PASS_SET)[number], number>
> = {
  adaptive: {
    steady: 6,
    burst: 10,
    'sustained-overload': 28,
    recovery: 18,
    'capacity-change': 102,
  },
  'static-floor': {
    steady: 24,
    burst: 28,
    'sustained-overload': 56,
    recovery: 36,
    'capacity-change': 132,
  },
  'static-ceiling': {
    steady: 0,
    burst: 24,
    'sustained-overload': 192,
    recovery: 72,
    'capacity-change': 48,
  },
  'static-oracle': {
    steady: 0,
    burst: 0,
    'sustained-overload': 0,
    recovery: 0,
    'capacity-change': 48,
  },
};

const HAND_ADAPTIVE_LIMITS: Record<(typeof PASS_SET)[number], readonly number[]> =
  {
    steady: [1, 2, 3, 4, 5, 5, 5, 5],
    burst: [1, 2, 3, 4, 5, 5, 5, 5],
    'sustained-overload': [1, 2, 3, 4, 5, 6, 7, 8],
    recovery: [1, 2, 3, 4, 5, 5, 5, 5],
    'capacity-change': [1, 2, 3, 4, 5, 2, 2, 3, 4, 5, 6, 7],
  };

function windowCount(scenario: ScenarioId): number {
  return scenario === 'capacity-change' ? 12 : 8;
}

function offeredInWindow(scenario: ScenarioId, index: number): number {
  switch (scenario) {
    case 'steady':
      return 4;
    case 'burst':
      return index === 3 ? 40 : 4;
    case 'sustained-overload':
      return 40;
    case 'recovery':
      return index < 3 ? 40 : 4;
    case 'capacity-change':
      return 16;
    case 'mixed':
      return 34;
    default:
      throw new Error(`Unhandled scenario ${scenario as string}`);
  }
}

function capacityAt(scenario: ScenarioId, index: number): number {
  if (scenario !== 'capacity-change') {
    return 8;
  }
  if (index < 4) {
    return 16;
  }
  if (index < 8) {
    return 4;
  }
  return 16;
}

function initialCapacity(scenario: ScenarioId): number {
  return scenario === 'capacity-change' ? 16 : 8;
}

function clientAt(scenario: ScenarioId, seq: number): string {
  if (scenario !== 'mixed') {
    return 'ip:shared';
  }
  if (seq < 30) {
    return 'ip:heavy';
  }
  return `ip:light-${seq - 30}`;
}

function buildTrace(scenario: ScenarioId): TraceEvent[] {
  const events: TraceEvent[] = [];
  const windows = windowCount(scenario);
  for (let index = 0; index < windows; index += 1) {
    const count = offeredInWindow(scenario, index);
    for (let seq = 0; seq < count; seq += 1) {
      events.push({
        clientId: clientAt(scenario, seq),
        atMs: BASE + index * WINDOW_MS + seq,
      });
    }
  }
  return events;
}

function windowIndexOf(atMs: number): number {
  return (calendarWindowStart(atMs, WINDOW_MS) - BASE) / WINDOW_MS;
}

function groupWindows(trace: TraceEvent[]): TraceEvent[][] {
  const groups: TraceEvent[][] = [];
  for (const event of trace) {
    const index = windowIndexOf(event.atMs);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`event at ${event.atMs} is outside the trace horizon`);
    }
    if (groups[index] === undefined) {
      groups[index] = [];
    }
    groups[index].push(event);
  }
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index] === undefined) {
      throw new Error(`trace is missing window ${index}`);
    }
  }
  return groups;
}

function clientCounts(trace: TraceEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of trace) {
    if (counts[event.clientId] === undefined) {
      counts[event.clientId] = 0;
    }
  }
  return counts;
}

function addScore(
  totals: { shortfall: number; excess: number },
  offered: number,
  admitted: number,
  capacity: number,
): void {
  totals.shortfall += Math.max(0, Math.min(offered, capacity) - admitted);
  totals.excess += Math.max(0, admitted - capacity);
}

interface RunnerReport {
  runner: RunnerId;
  offered: number;
  admitted: number;
  rejected: number;
  shortfall: number;
  excess: number;
  regret: number;
  normalizedRegret: number;
  limitsInForce: number[];
  limitAfterUpdate?: number[];
  outcomes?: Record<OutcomeName, number>;
  perClientAdmitted: Record<string, number>;
}

function classifyOutcome(
  before: AdaptiveState,
  signal: { congested: boolean; saturated: boolean },
  after: AdaptiveState,
): OutcomeName {
  if (signal.congested) {
    return 'decrease';
  }
  if (before.hold || !signal.saturated) {
    return 'hold';
  }
  if (after.limit > before.limit) {
    return 'increase';
  }
  return 'hold';
}

function replayAdaptive(scenario: ScenarioId, trace: TraceEvent[]): RunnerReport {
  const store = new InMemoryStore();
  let state = createAdaptiveState(CONFIG);
  const groups = groupWindows(trace);
  const perClientAdmitted = clientCounts(trace);
  const limitsInForce: number[] = [];
  const limitAfterUpdate: number[] = [];
  const outcomes: Record<OutcomeName, number> = {
    increase: 0,
    decrease: 0,
    hold: 0,
  };
  let offered = 0;
  let admitted = 0;
  const totals = { shortfall: 0, excess: 0 };

  for (let index = 0; index < groups.length; index += 1) {
    const events = groups[index];
    const limitInForce = state.limit;
    limitsInForce.push(limitInForce);
    const windowStart = calendarWindowStart(events[0].atMs, WINDOW_MS);
    const resetAt = windowStart + WINDOW_MS;
    let windowAdmitted = 0;
    for (const event of events) {
      const consumed = store.tryConsume(GLOBAL_KEY, windowStart, limitInForce);
      const decision = fixedWindowDecision({
        allowed: consumed.allowed,
        count: consumed.count,
        limit: limitInForce,
        now: event.atMs,
        resetAt,
      });
      if (decision.allowed) {
        windowAdmitted += 1;
        admitted += 1;
        perClientAdmitted[event.clientId] += 1;
      }
    }
    offered += events.length;
    const capacity = capacityAt(scenario, index);
    addScore(totals, events.length, windowAdmitted, capacity);
    const signal = {
      available: true as const,
      congested: windowAdmitted > capacity,
      saturated: windowAdmitted === limitInForce,
    };
    const before = state;
    const applied = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: index,
      signal,
    });
    state = applied.state;
    limitAfterUpdate.push(state.limit);
    outcomes[classifyOutcome(before, signal, state)] += 1;
  }

  const regret = totals.shortfall + totals.excess;
  return {
    runner: 'adaptive',
    offered,
    admitted,
    rejected: offered - admitted,
    shortfall: totals.shortfall,
    excess: totals.excess,
    regret,
    normalizedRegret: regret / offered,
    limitsInForce,
    limitAfterUpdate,
    outcomes,
    perClientAdmitted,
  };
}

function replayFixedLimit(
  scenario: ScenarioId,
  trace: TraceEvent[],
  runner: RunnerId,
  limit: number,
  keyFor: (event: TraceEvent) => string,
): RunnerReport {
  const limiter = new FixedWindowLimiter(
    { limit, windowMs: WINDOW_MS },
    new InMemoryStore(),
    new FakeClock(BASE),
  );
  const groups = groupWindows(trace);
  const perClientAdmitted = clientCounts(trace);
  const limitsInForce: number[] = [];
  let offered = 0;
  let admitted = 0;
  const totals = { shortfall: 0, excess: 0 };

  for (let index = 0; index < groups.length; index += 1) {
    const events = groups[index];
    limitsInForce.push(limit);
    let windowAdmitted = 0;
    for (const event of events) {
      const decision = limiter.consume(keyFor(event), event.atMs);
      if (decision.allowed) {
        windowAdmitted += 1;
        admitted += 1;
        perClientAdmitted[event.clientId] += 1;
      }
    }
    offered += events.length;
    addScore(totals, events.length, windowAdmitted, capacityAt(scenario, index));
  }

  const regret = totals.shortfall + totals.excess;
  return {
    runner,
    offered,
    admitted,
    rejected: offered - admitted,
    shortfall: totals.shortfall,
    excess: totals.excess,
    regret,
    normalizedRegret: regret / offered,
    limitsInForce,
    perClientAdmitted,
  };
}

function replayScenario(scenario: ScenarioId): {
  scenario: ScenarioId;
  inPassSet: boolean;
  initialCapacity: number;
  traceLength: number;
  runners: RunnerReport[];
} {
  const trace = buildTrace(scenario);
  const oracleLimit = initialCapacity(scenario);
  return {
    scenario,
    inPassSet: PASS_SET.includes(scenario),
    initialCapacity: oracleLimit,
    traceLength: trace.length,
    runners: [
      replayAdaptive(scenario, trace),
      replayFixedLimit(scenario, trace, 'static-floor', FLOOR, () => GLOBAL_KEY),
      replayFixedLimit(
        scenario,
        trace,
        'static-ceiling',
        CEILING,
        () => GLOBAL_KEY,
      ),
      replayFixedLimit(
        scenario,
        trace,
        'static-oracle',
        oracleLimit,
        () => GLOBAL_KEY,
      ),
      replayFixedLimit(
        scenario,
        trace,
        'per-client-fixed-window-reference',
        PER_CLIENT_REFERENCE_LIMIT,
        (event) => event.clientId,
      ),
    ],
  };
}

function runnerReport(
  scenarios: ReturnType<typeof replayScenario>[],
  scenario: ScenarioId,
  runner: RunnerId,
): RunnerReport {
  const found = scenarios
    .find((entry) => entry.scenario === scenario)
    ?.runners.find((entry) => entry.runner === runner);
  if (!found) {
    throw new Error(`missing ${runner} report for ${scenario}`);
  }
  return found;
}

function meanNormalized(
  scenarios: ReturnType<typeof replayScenario>[],
  runner: RunnerId,
): number {
  const total = PASS_SET.reduce(
    (sum, scenario) => sum + runnerReport(scenarios, scenario, runner).normalizedRegret,
    0,
  );
  return total / PASS_SET.length;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function handMismatches(
  scenarios: ReturnType<typeof replayScenario>[],
): string[] {
  const mismatches: string[] = [];
  const checked: Array<keyof typeof HAND_REGRET> = [
    'adaptive',
    'static-floor',
    'static-ceiling',
    'static-oracle',
  ];
  for (const scenario of PASS_SET) {
    for (const runner of checked) {
      const actual = runnerReport(scenarios, scenario, runner).regret;
      const expected = HAND_REGRET[runner][scenario];
      if (actual !== expected) {
        mismatches.push(
          `${scenario} ${runner} regret ${actual} !== hand ${expected}`,
        );
      }
    }
    const limits = runnerReport(scenarios, scenario, 'adaptive').limitsInForce;
    const expectedLimits = HAND_ADAPTIVE_LIMITS[scenario];
    if (!sameNumbers(limits, expectedLimits)) {
      mismatches.push(
        `${scenario} adaptive limits [${limits.join(',')}] !== hand [${expectedLimits.join(',')}]`,
      );
    }
  }
  return mismatches;
}

function main(): void {
  const wallStart = process.hrtime.bigint();
  const scenarios = SCENARIOS.map((scenario) => replayScenario(scenario));
  const elapsedMs = Number(process.hrtime.bigint() - wallStart) / 1e6;

  const means = {
    adaptive: meanNormalized(scenarios, 'adaptive'),
    'static-floor': meanNormalized(scenarios, 'static-floor'),
    'static-ceiling': meanNormalized(scenarios, 'static-ceiling'),
    'static-oracle': meanNormalized(scenarios, 'static-oracle'),
  };
  const adaptiveBeatsStaticFloor = means.adaptive < means['static-floor'];
  const adaptiveBeatsStaticCeiling = means.adaptive < means['static-ceiling'];
  const mismatches = handMismatches(scenarios);
  const passed = adaptiveBeatsStaticFloor && adaptiveBeatsStaticCeiling;

  const report = {
    mode: 'adaptive-compare',
    parameters: {
      floor: FLOOR,
      initial: INITIAL,
      ceiling: CEILING,
      windowMs: WINDOW_MS,
      base: BASE,
      perClientReferenceLimit: PER_CLIENT_REFERENCE_LIMIT,
      globalKey: GLOBAL_KEY,
    },
    correctness: {
      scenarios,
      means,
      comparisons: {
        adaptiveBeatsStaticFloor,
        adaptiveBeatsStaticCeiling,
        passed,
      },
      handCalculation: {
        matched: mismatches.length === 0,
        mismatches,
      },
    },
    observational: {
      elapsedMs: Number(elapsedMs.toFixed(3)),
    },
    notes: [
      'Same ordered trace per scenario, fresh state per runner',
      'Global runners consume key "global". per-client-fixed-window-reference is orientation only and is not a pass baseline',
      'Pass set is steady, burst, sustained-overload, recovery, and capacity-change. Mixed is reported and excluded from the mean',
      'Pass iff adaptive mean normalized regret is strictly below static-floor and static-ceiling. The oracle is a reference',
      'Congestion is admitted > plant capacity. Rejects are not congestion',
      'observational elapsedMs is machine-dependent and is not a pass gate',
    ],
  };

  console.log(JSON.stringify(report, null, 2));
  if (!passed || mismatches.length > 0) {
    console.error(
      'Adaptive comparison did not meet the pre-registered result. Parameters were not changed.',
    );
    process.exitCode = 1;
  }
}

main();
