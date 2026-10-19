/**
 * Milestone 6 global-budget comparison.
 *
 * One ordered trace per scenario is replayed from fresh state for an adaptive
 * controller, static floor, static ceiling, a static oracle, and a per-client
 * fixed-window reference. The plant capacity stays in this file. The controller
 * receives only a boolean congestion signal.
 *
 * A nonzero exit is a negative experiment only after the hand assertions pass.
 * Trace defects and hand mismatches are verification defects.
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

type PassScenario = Exclude<ScenarioId, 'mixed'>;

type RunnerId =
  | 'adaptive'
  | 'static-floor'
  | 'static-ceiling'
  | 'static-oracle'
  | 'per-client-fixed-window-reference';

type OutcomeName = 'increase' | 'decrease' | 'hold';

type Conclusion = 'verification-defect' | 'negative-experiment' | 'passed';

interface TraceEvent {
  clientId: string;
  atMs: number;
}

interface ClosedWindow {
  index: number;
  windowStart: number;
  events: TraceEvent[];
}

const PASS_SET: readonly PassScenario[] = [
  'steady',
  'burst',
  'sustained-overload',
  'recovery',
  'capacity-change',
];

const SCENARIOS: readonly ScenarioId[] = [...PASS_SET, 'mixed'];

const HAND_OFFERED: Record<ScenarioId, number> = {
  steady: 32,
  burst: 68,
  'sustained-overload': 320,
  recovery: 140,
  'capacity-change': 192,
  mixed: 272,
};

const HAND_REGRET: Record<
  'adaptive' | 'static-floor' | 'static-ceiling' | 'static-oracle',
  Record<PassScenario, number>
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

const HAND_ADAPTIVE_LIMITS: Record<PassScenario, readonly number[]> = {
  steady: [1, 2, 3, 4, 5, 5, 5, 5],
  burst: [1, 2, 3, 4, 5, 5, 5, 5],
  'sustained-overload': [1, 2, 3, 4, 5, 6, 7, 8],
  recovery: [1, 2, 3, 4, 5, 5, 5, 5],
  'capacity-change': [1, 2, 3, 4, 5, 2, 2, 3, 4, 5, 6, 7],
};

const HAND_ADAPTIVE_ADMITTED: Record<PassScenario, readonly number[]> = {
  steady: [1, 2, 3, 4, 4, 4, 4, 4],
  burst: [1, 2, 3, 4, 4, 4, 4, 4],
  'sustained-overload': [1, 2, 3, 4, 5, 6, 7, 8],
  recovery: [1, 2, 3, 4, 4, 4, 4, 4],
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
      throw new Error(`verification defect: unhandled scenario ${scenario as string}`);
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

function defect(message: string): never {
  throw new Error(`verification defect: ${message}`);
}

function closeWindows(trace: TraceEvent[]): ClosedWindow[] {
  if (BASE % WINDOW_MS !== 0) {
    defect('BASE is not divisible by windowMs');
  }
  if (trace.length === 0) {
    defect('trace is empty');
  }

  const windows: ClosedWindow[] = [];
  let current: TraceEvent[] = [];
  let currentStart = calendarWindowStart(trace[0].atMs, WINDOW_MS);

  const push = (): void => {
    const index = (currentStart - BASE) / WINDOW_MS;
    if (!Number.isInteger(index) || index < 0) {
      defect(`calendar window ${currentStart} is outside the trace horizon`);
    }
    if (index !== windows.length) {
      defect(`trace is missing window ${windows.length}`);
    }
    for (const event of current) {
      if (calendarWindowStart(event.atMs, WINDOW_MS) !== currentStart) {
        defect(`event at ${event.atMs} is outside calendar window ${currentStart}`);
      }
    }
    windows.push({ index, windowStart: currentStart, events: current });
  };

  for (const event of trace) {
    const start = calendarWindowStart(event.atMs, WINDOW_MS);
    if (start < currentStart) {
      defect('trace is not ordered by calendar window');
    }
    if (start > currentStart) {
      if (current.length === 0) {
        defect(`trace is missing window ${(currentStart - BASE) / WINDOW_MS}`);
      }
      push();
      current = [];
      currentStart = start;
    }
    current.push(event);
  }
  if (current.length === 0) {
    defect('trace ended without a window');
  }
  push();
  return windows;
}

function assertClosedShape(scenario: ScenarioId, windows: ClosedWindow[]): void {
  if (windows.length !== windowCount(scenario)) {
    defect(
      `${scenario} closed ${windows.length} windows, expected ${windowCount(scenario)}`,
    );
  }
  for (const window of windows) {
    const expectedStart = BASE + window.index * WINDOW_MS;
    if (window.windowStart !== expectedStart) {
      defect(
        `${scenario} window ${window.index} starts at ${window.windowStart}, expected ${expectedStart}`,
      );
    }
    const expectedOffered = offeredInWindow(scenario, window.index);
    if (window.events.length !== expectedOffered) {
      defect(
        `${scenario} window ${window.index} offered ${window.events.length}, expected ${expectedOffered}`,
      );
    }
  }
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
  usesController: boolean;
  offered: number;
  admitted: number;
  rejected: number;
  shortfall: number;
  excess: number;
  regret: number;
  normalizedRegret: number;
  limitsInForce: number[];
  offeredByWindow: number[];
  admittedByWindow: number[];
  limitAfterUpdate?: number[];
  outcomes: Record<OutcomeName, number>;
  perClientAdmitted: Record<string, number>;
}

function zeroOutcomes(): Record<OutcomeName, number> {
  return { increase: 0, decrease: 0, hold: 0 };
}

function classifyOutcome(
  before: AdaptiveState,
  signal: { congested: boolean; saturated: boolean },
): OutcomeName {
  if (signal.congested) {
    return 'decrease';
  }
  if (before.hold || !signal.saturated) {
    return 'hold';
  }
  return 'increase';
}

function finishReport(
  runner: RunnerId,
  usesController: boolean,
  offered: number,
  admitted: number,
  totals: { shortfall: number; excess: number },
  limitsInForce: number[],
  offeredByWindow: number[],
  admittedByWindow: number[],
  outcomes: Record<OutcomeName, number>,
  perClientAdmitted: Record<string, number>,
  limitAfterUpdate?: number[],
): RunnerReport {
  const regret = totals.shortfall + totals.excess;
  const clientSum = Object.values(perClientAdmitted).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (clientSum !== admitted) {
    defect(`${runner} per-client admits ${clientSum} !== admitted ${admitted}`);
  }
  return {
    runner,
    usesController,
    offered,
    admitted,
    rejected: offered - admitted,
    shortfall: totals.shortfall,
    excess: totals.excess,
    regret,
    normalizedRegret: offered === 0 ? defect(`${runner} offered 0`) : regret / offered,
    limitsInForce,
    offeredByWindow,
    admittedByWindow,
    limitAfterUpdate,
    outcomes,
    perClientAdmitted,
  };
}

function replayAdaptive(scenario: ScenarioId, trace: TraceEvent[]): RunnerReport {
  const store = new InMemoryStore();
  let state = createAdaptiveState(CONFIG);
  const windows = closeWindows(trace);
  assertClosedShape(scenario, windows);
  const perClientAdmitted = clientCounts(trace);
  const limitsInForce: number[] = [];
  const offeredByWindow: number[] = [];
  const admittedByWindow: number[] = [];
  const limitAfterUpdate: number[] = [];
  const outcomes = zeroOutcomes();
  let offered = 0;
  let admitted = 0;
  const totals = { shortfall: 0, excess: 0 };

  for (const window of windows) {
    const limitInForce = state.limit;
    limitsInForce.push(limitInForce);
    const resetAt = window.windowStart + WINDOW_MS;
    let windowAdmitted = 0;
    for (const event of window.events) {
      if (calendarWindowStart(event.atMs, WINDOW_MS) !== window.windowStart) {
        defect(`event at ${event.atMs} escaped window ${window.index}`);
      }
      const consumed = store.tryConsume(GLOBAL_KEY, window.windowStart, limitInForce);
      const decision = fixedWindowDecision({
        allowed: consumed.allowed,
        count: consumed.count,
        limit: limitInForce,
        now: event.atMs,
        resetAt,
      });
      if (decision.allowed !== consumed.allowed) {
        defect('fixedWindowDecision.allowed disagrees with tryConsume');
      }
      if (decision.allowed) {
        windowAdmitted += 1;
        admitted += 1;
        perClientAdmitted[event.clientId] += 1;
      }
    }
    offered += window.events.length;
    offeredByWindow.push(window.events.length);
    admittedByWindow.push(windowAdmitted);
    const capacity = capacityAt(scenario, window.index);
    addScore(totals, window.events.length, windowAdmitted, capacity);
    const signal = {
      available: true as const,
      congested: windowAdmitted > capacity,
      saturated: windowAdmitted === limitInForce,
    };
    const before = state;
    const applied = applyAdaptiveUpdate(CONFIG, state, {
      windowIndex: window.index,
      signal,
    });
    if (applied.status !== 'applied') {
      defect(`apply status ${applied.status} for window ${window.index}`);
    }
    state = applied.state;
    limitAfterUpdate.push(state.limit);
    outcomes[classifyOutcome(before, signal)] += 1;
  }

  return finishReport(
    'adaptive',
    true,
    offered,
    admitted,
    totals,
    limitsInForce,
    offeredByWindow,
    admittedByWindow,
    outcomes,
    perClientAdmitted,
    limitAfterUpdate,
  );
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
  const windows = closeWindows(trace);
  assertClosedShape(scenario, windows);
  const perClientAdmitted = clientCounts(trace);
  const limitsInForce: number[] = [];
  const offeredByWindow: number[] = [];
  const admittedByWindow: number[] = [];
  let offered = 0;
  let admitted = 0;
  const totals = { shortfall: 0, excess: 0 };

  for (const window of windows) {
    limitsInForce.push(limit);
    let windowAdmitted = 0;
    for (const event of window.events) {
      const decision = limiter.consume(keyFor(event), event.atMs);
      if (decision.allowed) {
        windowAdmitted += 1;
        admitted += 1;
        perClientAdmitted[event.clientId] += 1;
      }
    }
    offered += window.events.length;
    offeredByWindow.push(window.events.length);
    admittedByWindow.push(windowAdmitted);
    addScore(totals, window.events.length, windowAdmitted, capacityAt(scenario, window.index));
  }

  return finishReport(
    runner,
    false,
    offered,
    admitted,
    totals,
    limitsInForce,
    offeredByWindow,
    admittedByWindow,
    zeroOutcomes(),
    perClientAdmitted,
  );
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
    inPassSet: PASS_SET.includes(scenario as PassScenario),
    initialCapacity: oracleLimit,
    traceLength: trace.length,
    runners: [
      replayAdaptive(scenario, trace),
      replayFixedLimit(scenario, trace, 'static-floor', FLOOR, () => GLOBAL_KEY),
      replayFixedLimit(scenario, trace, 'static-ceiling', CEILING, () => GLOBAL_KEY),
      replayFixedLimit(scenario, trace, 'static-oracle', oracleLimit, () => GLOBAL_KEY),
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

type ScenarioReport = ReturnType<typeof replayScenario>;

function runnerReport(
  scenarios: ScenarioReport[],
  scenario: ScenarioId,
  runner: RunnerId,
): RunnerReport {
  const found = scenarios
    .find((entry) => entry.scenario === scenario)
    ?.runners.find((entry) => entry.runner === runner);
  if (!found) {
    defect(`missing ${runner} report for ${scenario}`);
  }
  return found;
}

function meanOf(
  scenarios: ScenarioReport[],
  runner: RunnerId,
  value: (report: RunnerReport) => number,
): number {
  const ids = PASS_SET as readonly string[];
  if (ids.length !== 5 || ids.includes('mixed')) {
    defect('pass set must be the five frozen scenarios and must exclude mixed');
  }
  const total = PASS_SET.reduce(
    (sum, scenario) => sum + value(runnerReport(scenarios, scenario, runner)),
    0,
  );
  return total / PASS_SET.length;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function formatMismatch(
  scenario: string,
  runner: string,
  field: string,
  actual: string,
  expected: string,
): string {
  return `verification defect: hand mismatch scenario=${scenario} runner=${runner} field=${field} actual=${actual} expected=${expected}`;
}

function handMismatches(scenarios: ScenarioReport[]): string[] {
  const mismatches: string[] = [];
  const checked: Array<keyof typeof HAND_REGRET> = [
    'adaptive',
    'static-floor',
    'static-ceiling',
    'static-oracle',
  ];

  if (capacityAt('capacity-change', 0) !== 16 || capacityAt('capacity-change', 4) !== 4) {
    defect('capacity-change plant capacity was changed');
  }

  for (const scenario of PASS_SET) {
    for (const runner of checked) {
      const report = runnerReport(scenarios, scenario, runner);
      if (report.regret !== HAND_REGRET[runner][scenario]) {
        mismatches.push(
          formatMismatch(
            scenario,
            runner,
            'regret',
            String(report.regret),
            String(HAND_REGRET[runner][scenario]),
          ),
        );
      }
      if (report.offered !== HAND_OFFERED[scenario]) {
        mismatches.push(
          formatMismatch(
            scenario,
            runner,
            'offered',
            String(report.offered),
            String(HAND_OFFERED[scenario]),
          ),
        );
      }
    }

    const adaptive = runnerReport(scenarios, scenario, 'adaptive');
    if (!sameNumbers(adaptive.limitsInForce, HAND_ADAPTIVE_LIMITS[scenario])) {
      mismatches.push(
        formatMismatch(
          scenario,
          'adaptive',
          'limitsInForce',
          adaptive.limitsInForce.join(','),
          HAND_ADAPTIVE_LIMITS[scenario].join(','),
        ),
      );
    }
    if (!sameNumbers(adaptive.admittedByWindow, HAND_ADAPTIVE_ADMITTED[scenario])) {
      mismatches.push(
        formatMismatch(
          scenario,
          'adaptive',
          'admittedByWindow',
          adaptive.admittedByWindow.join(','),
          HAND_ADAPTIVE_ADMITTED[scenario].join(','),
        ),
      );
    }
  }

  const burst = runnerReport(scenarios, 'burst', 'adaptive');
  const burstRejected = burst.offeredByWindow[3] - burst.admittedByWindow[3];
  if (burst.admittedByWindow[3] !== 4 || burstRejected !== 36) {
    mismatches.push(
      formatMismatch(
        'burst',
        'adaptive',
        'window3',
        `admitted=${burst.admittedByWindow[3]} rejected=${burstRejected}`,
        'admitted=4 rejected=36',
      ),
    );
  }
  if (burst.limitsInForce[4] !== 5 || burst.limitAfterUpdate?.[3] !== 5) {
    mismatches.push(
      formatMismatch(
        'burst',
        'adaptive',
        'followingLimit',
        `inForce=${burst.limitsInForce[4]} after=${burst.limitAfterUpdate?.[3]}`,
        '5',
      ),
    );
  }

  const capacity = runnerReport(scenarios, 'capacity-change', 'adaptive');
  if (capacity.admittedByWindow[4] !== 5) {
    mismatches.push(
      formatMismatch(
        'capacity-change',
        'adaptive',
        'window4Admitted',
        String(capacity.admittedByWindow[4]),
        '5',
      ),
    );
  }
  if (capacity.limitsInForce[5] !== 2) {
    mismatches.push(
      formatMismatch(
        'capacity-change',
        'adaptive',
        'window5LimitInForce',
        String(capacity.limitsInForce[5]),
        '2',
      ),
    );
  }

  const oracle = runnerReport(scenarios, 'capacity-change', 'static-oracle');
  if (oracle.limitsInForce.some((limit) => limit !== 16)) {
    mismatches.push(
      formatMismatch(
        'capacity-change',
        'static-oracle',
        'limitsInForce',
        oracle.limitsInForce.join(','),
        '16 on every window',
      ),
    );
  }

  const mixed = runnerReport(scenarios, 'mixed', 'adaptive');
  if (mixed.offered !== HAND_OFFERED.mixed) {
    mismatches.push(
      formatMismatch('mixed', 'adaptive', 'offered', String(mixed.offered), '272'),
    );
  }
  const heavy = mixed.perClientAdmitted['ip:heavy'];
  if (heavy !== 36) {
    mismatches.push(
      formatMismatch('mixed', 'adaptive', 'ip:heavy', String(heavy), '36'),
    );
  }
  for (let light = 0; light < 4; light += 1) {
    const client = `ip:light-${light}`;
    const actual = mixed.perClientAdmitted[client];
    if (actual !== 0) {
      mismatches.push(formatMismatch('mixed', 'adaptive', client, String(actual), '0'));
    }
  }

  return mismatches;
}

function assertMeansFollowFormula(
  scenarios: ScenarioReport[],
  means: Record<keyof typeof HAND_REGRET, number>,
): void {
  const runners = Object.keys(means) as Array<keyof typeof HAND_REGRET>;
  for (const runner of runners) {
    const formula = meanOf(
      scenarios,
      runner,
      (report) => report.regret / report.offered,
    );
    if (means[runner] !== formula) {
      defect(
        `printed ${runner} mean ${means[runner]} does not follow the approved formula ${formula}`,
      );
    }
  }
}

function main(): void {
  const wallStart = process.hrtime.bigint();
  const scenarios = SCENARIOS.map((scenario) => replayScenario(scenario));
  const elapsedMs = Number(process.hrtime.bigint() - wallStart) / 1e6;

  const means = {
    adaptive: meanOf(scenarios, 'adaptive', (report) => report.normalizedRegret),
    'static-floor': meanOf(scenarios, 'static-floor', (report) => report.normalizedRegret),
    'static-ceiling': meanOf(
      scenarios,
      'static-ceiling',
      (report) => report.normalizedRegret,
    ),
    'static-oracle': meanOf(scenarios, 'static-oracle', (report) => report.normalizedRegret),
  };
  assertMeansFollowFormula(scenarios, means);

  const mismatches = handMismatches(scenarios);
  const handMatched = mismatches.length === 0;
  const adaptiveBeatsStaticFloor = means.adaptive < means['static-floor'];
  const adaptiveBeatsStaticCeiling = means.adaptive < means['static-ceiling'];
  const comparisonHolds = adaptiveBeatsStaticFloor && adaptiveBeatsStaticCeiling;

  let conclusion: Conclusion;
  if (!handMatched) {
    conclusion = 'verification-defect';
  } else if (!comparisonHolds) {
    conclusion = 'negative-experiment';
  } else {
    conclusion = 'passed';
  }

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
        passed: comparisonHolds,
      },
      handCalculation: {
        matched: handMatched,
        mismatches,
      },
      conclusion,
    },
    observational: {
      elapsedMs: Number(elapsedMs.toFixed(3)),
    },
    notes: [
      'Same ordered trace per scenario, fresh state per runner',
      'A window closes when the next event has a larger calendar start, or when the trace ends',
      'Global runners consume key "global". per-client-fixed-window-reference is orientation only and is not a pass baseline',
      'Pass set is steady, burst, sustained-overload, recovery, and capacity-change. Mixed is reported and excluded from the mean',
      'Pass iff adaptive mean normalized regret is strictly below static-floor and static-ceiling. The oracle is a reference',
      'Congestion is admitted > plant capacity. Rejects are not congestion',
      'conclusion is a negative experiment only when handCalculation.matched is true and a comparison then fails',
      'observational elapsedMs is machine-dependent and is not a pass gate',
    ],
  };

  if (!handMatched) {
    console.log(JSON.stringify(report, null, 2));
    console.error(
      'verification defect: hand mismatch. Expected values were not changed. This is not a negative experiment.',
    );
    for (const line of mismatches) {
      console.error(line);
    }
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(report, null, 2));
  if (!comparisonHolds) {
    console.error(
      'negative experiment: adaptive mean normalized regret is not strictly below both static floor and static ceiling. Parameters, traces, weights, and the pass set were not changed.',
    );
    process.exitCode = 1;
  }
}

main();
