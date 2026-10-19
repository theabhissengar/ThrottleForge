/**
 * Sequential fixed-window comparison of the in-memory store and Redis.
 *
 * Correctness is decision equality on one ordered trace. Wall-clock numbers
 * are printed and are not a pass/fail gate.
 *
 * Requires a local Redis:
 *   $env:REDIS_URL = "redis://127.0.0.1:6379"
 *   npm run load:redis-compare -- --scenario boundary-burst --limit 10 --windowMs 1000
 */

import {
  AsyncFixedWindowLimiter,
  Decision,
  FixedWindowLimiter,
  InMemoryStore,
  RedisFixedWindowStore,
} from '../../apps/api/src/core';
import {
  asRedisEvalClient,
  createIoredis,
  deleteKeysByPrefix,
  waitForRedisReady,
} from '../../apps/api/src/rate-limit/ioredis.client';
import { summarizeLatencies } from './pool';

type Scenario = 'boundary-burst' | 'sustained-over';

interface TraceEvent {
  clientId: string;
  atMs: number;
}

const BASE = 1_700_000_000_000;

function usage(): never {
  console.error(`Usage: ts-node tools/load-gen/redis-compare.ts [options]

Options:
  --scenario <name>   boundary-burst | sustained-over (default boundary-burst)
  --limit <n>         Fixed-window limit (default 10)
  --windowMs <n>      Window length in ms (default 1000)

REDIS_URL is required. Outage behavior is not compared.
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

function parseArgs(argv: string[]): {
  scenario: Scenario;
  limit: number;
  windowMs: number;
} {
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
  if (scenario !== 'boundary-burst' && scenario !== 'sustained-over') {
    throw new Error(
      `--scenario must be boundary-burst or sustained-over (got ${scenario})`,
    );
  }

  return {
    scenario,
    limit: parsePositiveInt(opts.limit ?? '10', '--limit'),
    windowMs: parsePositiveInt(opts.windowMs ?? '1000', '--windowMs'),
  };
}

function buildTrace(
  scenario: Scenario,
  limit: number,
  windowMs: number,
): TraceEvent[] {
  if (scenario === 'sustained-over') {
    const count = limit * 2;
    return Array.from({ length: count }, (_, i) => ({
      clientId: 'ip:shared',
      atMs: BASE + Math.floor((i * windowMs) / count),
    }));
  }

  const events: TraceEvent[] = [];
  for (let i = 0; i < limit; i += 1) {
    events.push({ clientId: 'ip:shared', atMs: BASE + windowMs - 1 });
  }
  for (let i = 0; i < limit; i += 1) {
    events.push({ clientId: 'ip:shared', atMs: BASE + windowMs });
  }
  return events;
}

/** Keeps a frozen logical clock from expiring a 1ms Redis TTL during replay. */
const REPLAY_TTL_FLOOR_MS = 30_000;

class ReplayStore {
  constructor(private readonly inner: RedisFixedWindowStore) {}

  tryConsume(
    key: string,
    windowStart: number,
    limit: number,
    ttlMs: number,
  ): ReturnType<RedisFixedWindowStore['tryConsume']> {
    return this.inner.tryConsume(
      key,
      windowStart,
      limit,
      Math.max(ttlMs, REPLAY_TTL_FLOOR_MS),
    );
  }
}
function comparable(decision: Decision): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number | null;
} {
  return {
    allowed: decision.allowed,
    remaining: decision.remaining,
    resetAt: decision.resetAt,
    retryAfterSec: decision.retryAfterSec ?? null,
  };
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('REDIS_URL is required for load:redis-compare');
    process.exit(1);
  }

  let config: ReturnType<typeof parseArgs>;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    usage();
  }

  const trace = buildTrace(config.scenario, config.limit, config.windowMs);
  const prefix = `tf:fw:compare:${process.pid}:${Date.now()}`;
  const redis = createIoredis({
    url: redisUrl,
    prefix,
    connectTimeoutMs: 1000,
    commandTimeoutMs: 1000,
  });

  const mismatches: Array<{ index: number; memory: unknown; redis: unknown }> = [];
  const memoryLatencies: bigint[] = [];
  const redisLatencies: bigint[] = [];
  let memoryElapsedMs = 0;
  let redisElapsedMs = 0;

  try {
    await waitForRedisReady(redis, 1000);
    await redis.ping();

    const memory = new FixedWindowLimiter(
      { limit: config.limit, windowMs: config.windowMs },
      new InMemoryStore(),
    );
    const remote = new AsyncFixedWindowLimiter(
      { limit: config.limit, windowMs: config.windowMs },
      new ReplayStore(
        new RedisFixedWindowStore(
          asRedisEvalClient(redis),
          prefix,
          config.windowMs,
        ),
      ),
    );

    const memoryStart = process.hrtime.bigint();
    const memoryDecisions: Decision[] = [];
    for (const event of trace) {
      const t0 = process.hrtime.bigint();
      memoryDecisions.push(memory.consume(event.clientId, event.atMs));
      memoryLatencies.push(process.hrtime.bigint() - t0);
    }
    memoryElapsedMs = Number(process.hrtime.bigint() - memoryStart) / 1e6;

    const redisStart = process.hrtime.bigint();
    const redisDecisions: Decision[] = [];
    for (const event of trace) {
      const t0 = process.hrtime.bigint();
      const outcome = await remote.consume(event.clientId, event.atMs);
      redisLatencies.push(process.hrtime.bigint() - t0);
      if (outcome.type !== 'ok') {
        throw new Error(
          'Redis consume returned unavailable; refusing to compare outage behavior',
        );
      }
      redisDecisions.push(outcome.decision);
    }
    redisElapsedMs = Number(process.hrtime.bigint() - redisStart) / 1e6;

    for (let i = 0; i < trace.length; i += 1) {
      const left = comparable(memoryDecisions[i]);
      const right = comparable(redisDecisions[i]);
      if (
        left.allowed !== right.allowed ||
        left.remaining !== right.remaining ||
        left.resetAt !== right.resetAt
      ) {
        mismatches.push({ index: i, memory: left, redis: right });
      }
    }
  } finally {
    await deleteKeysByPrefix(redis, prefix);
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }

  const elapsed = (ms: number) =>
    ms > 0 ? Number(((trace.length / ms) * 1000).toFixed(2)) : null;

  console.log(
    JSON.stringify(
      {
        mode: 'redis-compare',
        scenario: config.scenario,
        limit: config.limit,
        windowMs: config.windowMs,
        traceLength: trace.length,
        correctness: {
          matched: mismatches.length === 0,
          mismatches,
        },
        observational: {
          memory: {
            elapsedMs: Number(memoryElapsedMs.toFixed(3)),
            throughputRps: elapsed(memoryElapsedMs),
            latency: summarizeLatencies(memoryLatencies),
          },
          redis: {
            elapsedMs: Number(redisElapsedMs.toFixed(3)),
            throughputRps: elapsed(redisElapsedMs),
            latency: summarizeLatencies(redisLatencies),
          },
        },
        notes: [
          'Same ordered trace, sequential replay, fresh in-memory state and a fresh Redis prefix',
          'Redis TTL during this replay is at least 30s so a 1ms logical remainder cannot expire the key between events',
          'correctness is decision equality (allowed, remaining, resetAt)',
          'observational latency/throughput are machine-dependent and are not a ranking',
          'Outage behavior is not compared',
        ],
      },
      null,
      2,
    ),
  );

  if (mismatches.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
