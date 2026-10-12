/**
 * Generate-once / replay-many algorithm comparison (Milestone 3).
 *
 * Builds a deterministic request trace once, then replays it against fresh
 * state for fixed-window, sliding-window, and token-bucket limiters.
 *
 * Correctness outcomes (allowed/rejected/errors/store size) are separate from
 * observational wall-clock latency/throughput. Algorithms are not expected to
 * allow equal numbers of requests.
 *
 * Example:
 *   npm run load:compare -- --scenario boundary-burst --limit 10 --windowMs 1000
 */

import {
  FakeClock,
  FixedWindowLimiter,
  InMemoryStore,
  SlidingWindowLimiter,
  SlidingWindowStore,
  TokenBucketLimiter,
  TokenBucketStore,
  tokenBucketFromWindow,
  RateLimiter,
} from '../../apps/api/src/core';
import { summarizeLatencies } from './pool';

type Algorithm = 'fixed' | 'sliding' | 'token-bucket';
type Scenario =
  | 'sustained-under'
  | 'sustained-over'
  | 'boundary-burst'
  | 'sw-decay'
  | 'tb-idle-burst'
  | 'many-clients';

interface TraceEvent {
  clientId: string;
  atMs: number;
}

interface Config {
  scenario: Scenario;
  limit: number;
  windowMs: number;
}

function usage(): never {
  console.error(`Usage: ts-node tools/load-gen/compare-scenarios.ts [options]

Options:
  --scenario <name>   sustained-under | sustained-over | boundary-burst |
                      sw-decay | tb-idle-burst | many-clients
  --limit <n>         Shared limit / capacity (default 10)
  --windowMs <n>      Shared window / refill horizon ms (default 1000)

Policy mapping: fixed & sliding use {limit, windowMs};
token-bucket uses capacity=limit, refillPerMs=limit/windowMs.
`);
  process.exit(1);
}

function parsePositiveInt(raw: string | undefined, name: string): number {
  if (raw === undefined) {
    throw new Error(`Missing ${name}`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be an integer >= 1 (got ${raw})`);
  }
  return n;
}

function parseArgs(argv: string[]): Config {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      usage();
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      usage();
    }
    opts[key] = value;
    i += 1;
  }

  const scenario = (opts.scenario ?? 'boundary-burst') as Scenario;
  const allowed: Scenario[] = [
    'sustained-under',
    'sustained-over',
    'boundary-burst',
    'sw-decay',
    'tb-idle-burst',
    'many-clients',
  ];
  if (!allowed.includes(scenario)) {
    throw new Error(`Unknown --scenario ${scenario}`);
  }

  return {
    scenario,
    limit: parsePositiveInt(opts.limit ?? '10', '--limit'),
    windowMs: parsePositiveInt(opts.windowMs ?? '1000', '--windowMs'),
  };
}

const BASE = 1_700_000_000_000;

function buildTrace(config: Config): TraceEvent[] {
  const { scenario, limit, windowMs } = config;
  const events: TraceEvent[] = [];

  switch (scenario) {
    case 'sustained-under': {
      const count = Math.max(1, Math.floor(limit / 2));
      for (let i = 0; i < count; i += 1) {
        events.push({
          clientId: 'ip:shared',
          atMs: BASE + Math.floor((i * windowMs) / count),
        });
      }
      break;
    }
    case 'sustained-over': {
      const count = limit * 2;
      for (let i = 0; i < count; i += 1) {
        events.push({
          clientId: 'ip:shared',
          atMs: BASE + Math.floor((i * windowMs) / count),
        });
      }
      break;
    }
    case 'boundary-burst': {
      for (let i = 0; i < limit; i += 1) {
        events.push({ clientId: 'ip:shared', atMs: BASE + windowMs - 1 });
      }
      for (let i = 0; i < limit; i += 1) {
        events.push({ clientId: 'ip:shared', atMs: BASE + windowMs });
      }
      break;
    }
    case 'sw-decay': {
      for (let i = 0; i < limit; i += 1) {
        events.push({ clientId: 'ip:shared', atMs: BASE });
      }
      // Cross boundary (often reject for SW), then probe mid-window decay.
      events.push({ clientId: 'ip:shared', atMs: BASE + windowMs });
      events.push({
        clientId: 'ip:shared',
        atMs: BASE + windowMs + Math.floor(windowMs / 2),
      });
      break;
    }
    case 'tb-idle-burst': {
      for (let i = 0; i < limit; i += 1) {
        events.push({ clientId: 'ip:shared', atMs: BASE });
      }
      // Idle for a full refill horizon, then burst again.
      for (let i = 0; i < limit; i += 1) {
        events.push({ clientId: 'ip:shared', atMs: BASE + windowMs });
      }
      break;
    }
    case 'many-clients': {
      for (let i = 0; i < limit * 3; i += 1) {
        events.push({
          clientId: `ip:client-${i}`,
          atMs: BASE + (i % 10),
        });
      }
      break;
    }
    default:
      throw new Error(`Unhandled scenario ${scenario as string}`);
  }

  return events;
}

function createLimiter(
  algorithm: Algorithm,
  limit: number,
  windowMs: number,
): { limiter: RateLimiter; size: () => number } {
  const clock = new FakeClock(BASE);
  if (algorithm === 'fixed') {
    const store = new InMemoryStore();
    return {
      limiter: new FixedWindowLimiter(
        { limit, windowMs },
        store,
        clock,
      ),
      size: () => store.size(),
    };
  }
  if (algorithm === 'sliding') {
    const store = new SlidingWindowStore();
    return {
      limiter: new SlidingWindowLimiter(
        { limit, windowMs },
        store,
        clock,
      ),
      size: () => store.size(),
    };
  }
  const store = new TokenBucketStore();
  return {
    limiter: new TokenBucketLimiter(
      tokenBucketFromWindow({ limit, windowMs }),
      store,
      clock,
    ),
    size: () => store.size(),
  };
}

function replay(
  algorithm: Algorithm,
  trace: TraceEvent[],
  limit: number,
  windowMs: number,
): {
  algorithm: Algorithm;
  correctness: {
    allowed: number;
    rejected: number;
    unexpectedErrors: number;
    storeSizeAfter: number;
  };
  observational: {
    elapsedMs: number;
    throughputRps: number | null;
    latency: ReturnType<typeof summarizeLatencies>;
  };
} {
  const { limiter, size } = createLimiter(algorithm, limit, windowMs);
  let allowed = 0;
  let rejected = 0;
  let unexpectedErrors = 0;
  const latencies: bigint[] = [];

  const wallStart = process.hrtime.bigint();
  for (const event of trace) {
    const t0 = process.hrtime.bigint();
    try {
      const decision = limiter.consume(event.clientId, event.atMs);
      if (decision.allowed) {
        allowed += 1;
      } else {
        rejected += 1;
      }
    } catch {
      unexpectedErrors += 1;
    }
    latencies.push(process.hrtime.bigint() - t0);
  }
  const wallEnd = process.hrtime.bigint();
  const elapsedMs = Number(wallEnd - wallStart) / 1e6;

  return {
    algorithm,
    correctness: {
      allowed,
      rejected,
      unexpectedErrors,
      storeSizeAfter: size(),
    },
    observational: {
      elapsedMs: Number(elapsedMs.toFixed(3)),
      throughputRps:
        elapsedMs > 0
          ? Number(((trace.length / elapsedMs) * 1000).toFixed(2))
          : null,
      latency: summarizeLatencies(latencies),
    },
  };
}

function main(): void {
  let config: Config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    usage();
  }

  const trace = buildTrace(config);
  const algorithms: Algorithm[] = ['fixed', 'sliding', 'token-bucket'];
  const results = algorithms.map((algo) =>
    replay(algo, trace, config.limit, config.windowMs),
  );

  console.log(
    JSON.stringify(
      {
        mode: 'compare',
        scenario: config.scenario,
        limit: config.limit,
        windowMs: config.windowMs,
        traceLength: trace.length,
        policyMapping: {
          fixed: '{ limit, windowMs }',
          sliding: '{ limit, windowMs } (weighted estimate)',
          'token-bucket':
            'capacity=limit, refillPerMs=limit/windowMs',
        },
        results,
        notes: [
          'Same ordered client identities and timestamps replayed per algorithm on fresh state',
          'Do not expect equal allow counts across algorithms',
          'observational latency/throughput are machine-dependent; not a CI gate',
          'Not a universal performance ranking',
        ],
      },
      null,
      2,
    ),
  );
}

main();
