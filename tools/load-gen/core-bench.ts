/**
 * Core (Nest-free) load generator for rate-limit algorithms + in-memory stores.
 *
 * Observational only — not a CI correctness gate for latency/throughput.
 * For side-by-side algorithm comparison on identical traces, use compare-scenarios.ts.
 *
 * Example:
 *   npx ts-node --transpile-only tools/load-gen/core-bench.ts --pattern one-client --requests 200 --concurrency 20 --algorithm fixed
 */

import {
  FakeClock,
  FixedWindowLimiter,
  InMemoryStore,
  RateLimiter,
  SlidingWindowLimiter,
  SlidingWindowStore,
  TokenBucketLimiter,
  TokenBucketStore,
  tokenBucketFromWindow,
} from '../../apps/api/src/core';
import { runPool, summarizeLatencies } from './pool';

type Pattern = 'one-client' | 'many-clients' | 'same-window' | 'cross-boundary';
type Algorithm = 'fixed' | 'sliding' | 'token-bucket';

interface Config {
  requests: number;
  concurrency: number;
  pattern: Pattern;
  algorithm: Algorithm;
  limit: number;
  windowMs: number;
}

function usage(): never {
  console.error(`Usage: ts-node tools/load-gen/core-bench.ts [options]

Options:
  --requests <n>       Total requests (integer >= 1)
  --concurrency <n>    Max in-flight (integer >= 1, <= requests)
  --pattern <name>     one-client | many-clients | same-window | cross-boundary
  --algorithm <name>   fixed | sliding | token-bucket (default fixed)
  --limit <n>          Rate limit (default 50)
  --windowMs <n>       Window length in ms (default 60000)

Patterns:
  one-client       Same client id for every request (same window)
  many-clients     Distinct client per request (same window)
  same-window      Alias of one-client (deterministic same window)
  cross-boundary   Half the requests before window end, half after FakeClock advance
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

  const requests = parsePositiveInt(opts.requests ?? '100', '--requests');
  let concurrency = parsePositiveInt(opts.concurrency ?? '10', '--concurrency');
  if (concurrency > requests) {
    console.error(
      `--concurrency (${concurrency}) > --requests (${requests}); clamping to ${requests}`,
    );
    concurrency = requests;
  }

  const pattern = (opts.pattern ?? 'one-client') as Pattern;
  const allowed: Pattern[] = [
    'one-client',
    'many-clients',
    'same-window',
    'cross-boundary',
  ];
  if (!allowed.includes(pattern)) {
    throw new Error(`Unknown --pattern ${pattern}`);
  }

  const algorithm = (opts.algorithm ?? 'fixed') as Algorithm;
  const algorithms: Algorithm[] = ['fixed', 'sliding', 'token-bucket'];
  if (!algorithms.includes(algorithm)) {
    throw new Error(`Unknown --algorithm ${algorithm}`);
  }

  const limit = parsePositiveInt(opts.limit ?? '50', '--limit');
  const windowMs = parsePositiveInt(opts.windowMs ?? '60000', '--windowMs');

  return { requests, concurrency, pattern, algorithm, limit, windowMs };
}

function createLimiter(
  algorithm: Algorithm,
  limit: number,
  windowMs: number,
  clock: FakeClock,
): {
  limiter: RateLimiter;
  size: () => number;
  purgeAfterAdvance: (windowStart: number) => void;
} {
  if (algorithm === 'fixed') {
    const store = new InMemoryStore();
    return {
      limiter: new FixedWindowLimiter({ limit, windowMs }, store, clock),
      size: () => store.size(),
      purgeAfterAdvance: (ws) => {
        for (let i = 0; i < 64; i += 1) {
          store.purgeStale(ws, 16);
        }
      },
    };
  }
  if (algorithm === 'sliding') {
    const store = new SlidingWindowStore();
    return {
      limiter: new SlidingWindowLimiter({ limit, windowMs }, store, clock),
      size: () => store.size(),
      purgeAfterAdvance: (ws) => {
        for (let i = 0; i < 64; i += 1) {
          store.purgeStale(ws, windowMs, 16);
        }
      },
    };
  }
  const store = new TokenBucketStore();
  const policy = tokenBucketFromWindow({ limit, windowMs });
  return {
    limiter: new TokenBucketLimiter(policy, store, clock),
    size: () => store.size(),
    purgeAfterAdvance: (ws) => {
      for (let i = 0; i < 64; i += 1) {
        store.purgeStale(ws, policy.capacity, policy.refillPerMs, 16);
      }
    },
  };
}

async function main(): Promise<void> {
  let config: Config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    usage();
  }

  const windowStart = 1_700_000_000_000;
  const clock = new FakeClock(windowStart);
  const { limiter, size, purgeAfterAdvance } = createLimiter(
    config.algorithm,
    config.limit,
    config.windowMs,
    clock,
  );

  const effectivePattern =
    config.pattern === 'same-window' ? 'one-client' : config.pattern;

  type Outcome = {
    allowed: boolean;
    error: boolean;
    latencyNs: bigint;
  };

  const sizeBefore = size();
  const wallStart = process.hrtime.bigint();

  const tally = (outcomes: Outcome[]) => {
    let allowed = 0;
    let rejected = 0;
    let errors = 0;
    const latencies: bigint[] = [];
    for (const o of outcomes) {
      latencies.push(o.latencyNs);
      if (o.error) {
        errors += 1;
      } else if (o.allowed) {
        allowed += 1;
      } else {
        rejected += 1;
      }
    }
    return { allowed, rejected, errors, latencies };
  };

  if (effectivePattern === 'cross-boundary') {
    const firstHalf = Math.floor(config.requests / 2);
    const secondHalf = config.requests - firstHalf;

    const runPhase = (count: number, clientPrefix: string) =>
      runPool(count, config.concurrency, async (i) => {
        const t0 = process.hrtime.bigint();
        try {
          const decision = limiter.consume(`${clientPrefix}:${i % 10}`);
          return {
            allowed: decision.allowed,
            error: false,
            latencyNs: process.hrtime.bigint() - t0,
          } satisfies Outcome;
        } catch {
          return {
            allowed: false,
            error: true,
            latencyNs: process.hrtime.bigint() - t0,
          } satisfies Outcome;
        }
      });

    const pre = await runPhase(firstHalf, 'ip:pre');
    clock.set(windowStart + config.windowMs);
    const sizeAtBoundary = size();
    const post = await runPhase(secondHalf, 'ip:post');

    purgeAfterAdvance(windowStart + config.windowMs);

    const stats = tally([...pre, ...post]);
    const wallEnd = process.hrtime.bigint();
    const elapsedMs = Number(wallEnd - wallStart) / 1e6;
    const latency = summarizeLatencies(stats.latencies);

    console.log(
      JSON.stringify(
        {
          mode: 'core',
          algorithm: config.algorithm,
          pattern: config.pattern,
          requests: config.requests,
          concurrency: config.concurrency,
          limit: config.limit,
          windowMs: config.windowMs,
          allowed: stats.allowed,
          rejected: stats.rejected,
          errors: stats.errors,
          elapsedMs: Number(elapsedMs.toFixed(3)),
          throughputRps:
            elapsedMs > 0
              ? Number(((config.requests / elapsedMs) * 1000).toFixed(2))
              : null,
          latency,
          storeSizeBefore: sizeBefore,
          storeSizeAtBoundary: sizeAtBoundary,
          storeSizeAfter: size(),
          note: 'FakeClock used for quota/boundary; elapsedMs is wall-clock observational only',
        },
        null,
        2,
      ),
    );
    return;
  }

  const outcomes = await runPool(
    config.requests,
    config.concurrency,
    async (i) => {
      const clientId =
        effectivePattern === 'many-clients' ? `ip:client-${i}` : 'ip:shared';
      const t0 = process.hrtime.bigint();
      try {
        const decision = limiter.consume(clientId);
        return {
          allowed: decision.allowed,
          error: false,
          latencyNs: process.hrtime.bigint() - t0,
        } satisfies Outcome;
      } catch {
        return {
          allowed: false,
          error: true,
          latencyNs: process.hrtime.bigint() - t0,
        } satisfies Outcome;
      }
    },
  );

  const storeSizeAfterTraffic = size();
  let storeSizeAfterAdvance: number | undefined;
  if (effectivePattern === 'many-clients') {
    clock.set(windowStart + config.windowMs);
    limiter.consume('ip:keepalive');
    purgeAfterAdvance(windowStart + config.windowMs);
    storeSizeAfterAdvance = size();
  }

  const stats = tally(outcomes);
  const wallEnd = process.hrtime.bigint();
  const elapsedMs = Number(wallEnd - wallStart) / 1e6;
  const latency = summarizeLatencies(stats.latencies);

  console.log(
    JSON.stringify(
      {
        mode: 'core',
        algorithm: config.algorithm,
        pattern: config.pattern,
        requests: config.requests,
        concurrency: config.concurrency,
        limit: config.limit,
        windowMs: config.windowMs,
        allowed: stats.allowed,
        rejected: stats.rejected,
        errors: stats.errors,
        elapsedMs: Number(elapsedMs.toFixed(3)),
        throughputRps:
          elapsedMs > 0
            ? Number(((config.requests / elapsedMs) * 1000).toFixed(2))
            : null,
        latency,
        storeSizeBefore: sizeBefore,
        storeSizeAfterTraffic,
        storeSizeAfterWindowAdvanceAndSweep: storeSizeAfterAdvance,
        note: 'FakeClock used for quota; elapsedMs is wall-clock observational only',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
