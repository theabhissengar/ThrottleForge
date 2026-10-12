/**
 * HTTP load generator against an already-running ThrottleForge API.
 *
 * Observational only. Expected 429 responses are rate-limit outcomes, not errors.
 *
 * Multi-client isolation requires the running API to honor X-Test-Client-Id:
 *   ALLOW_TEST_CLIENT_ID=true and NODE_ENV=development|test
 *
 * Example:
 *   npm run load:http -- --baseUrl http://127.0.0.1:3000 --requests 40 --concurrency 8 --pattern one-client
 */

import { runPool, summarizeLatencies } from './pool';

type Pattern = 'one-client' | 'many-clients';

interface Config {
  baseUrl: string;
  path: string;
  requests: number;
  concurrency: number;
  pattern: Pattern;
  clientId: string;
}

function usage(): never {
  console.error(`Usage: ts-node tools/load-gen/http-bench.ts [options]

Options:
  --baseUrl <url>      Already-running API origin (default http://127.0.0.1:3000)
  --path <path>        Path to hit (default /api/demo)
  --requests <n>       Total requests (integer >= 1)
  --concurrency <n>    Max in-flight (integer >= 1, <= requests)
  --pattern <name>     one-client | many-clients
  --clientId <id>      Shared X-Test-Client-Id for one-client (default load-shared)

Notes:
  - 429 counts as expectedRateLimited, not transportError.
  - many-clients needs ALLOW_TEST_CLIENT_ID=true and NODE_ENV=development|test on the server.
  - Do not compare these numbers with core-bench results (HTTP includes Nest/Express overhead).
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

  const requests = parsePositiveInt(opts.requests ?? '40', '--requests');
  let concurrency = parsePositiveInt(opts.concurrency ?? '8', '--concurrency');
  if (concurrency > requests) {
    console.error(
      `--concurrency (${concurrency}) > --requests (${requests}); clamping to ${requests}`,
    );
    concurrency = requests;
  }

  const pattern = (opts.pattern ?? 'one-client') as Pattern;
  if (pattern !== 'one-client' && pattern !== 'many-clients') {
    throw new Error(`Unknown --pattern ${pattern}`);
  }

  return {
    baseUrl: (opts.baseUrl ?? 'http://127.0.0.1:3000').replace(/\/$/, ''),
    path: opts.path ?? '/api/demo',
    requests,
    concurrency,
    pattern,
    clientId: opts.clientId ?? 'load-shared',
  };
}

type HttpOutcome = {
  ok: boolean;
  rateLimited: boolean;
  unexpectedStatus: number | null;
  transportError: string | null;
  latencyNs: bigint;
};

async function main(): Promise<void> {
  let config: Config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    usage();
  }

  const url = `${config.baseUrl}${config.path}`;
  const wallStart = process.hrtime.bigint();

  const outcomes = await runPool(
    config.requests,
    config.concurrency,
    async (i) => {
      const t0 = process.hrtime.bigint();
      const headers: Record<string, string> = {};
      if (config.pattern === 'one-client') {
        headers['X-Test-Client-Id'] = config.clientId;
      } else {
        headers['X-Test-Client-Id'] = `load-${i}`;
      }

      try {
        const res = await fetch(url, { headers });
        const latencyNs = process.hrtime.bigint() - t0;
        if (res.status === 200) {
          return {
            ok: true,
            rateLimited: false,
            unexpectedStatus: null,
            transportError: null,
            latencyNs,
          } satisfies HttpOutcome;
        }
        if (res.status === 429) {
          return {
            ok: false,
            rateLimited: true,
            unexpectedStatus: null,
            transportError: null,
            latencyNs,
          } satisfies HttpOutcome;
        }
        return {
          ok: false,
          rateLimited: false,
          unexpectedStatus: res.status,
          transportError: null,
          latencyNs,
        } satisfies HttpOutcome;
      } catch (err) {
        return {
          ok: false,
          rateLimited: false,
          unexpectedStatus: null,
          transportError: err instanceof Error ? err.message : String(err),
          latencyNs: process.hrtime.bigint() - t0,
        } satisfies HttpOutcome;
      }
    },
  );

  let success = 0;
  let expectedRateLimited = 0;
  let unexpectedStatus = 0;
  let transportErrors = 0;
  const latencies: bigint[] = [];
  const unexpectedStatuses: number[] = [];
  const transportSamples: string[] = [];

  for (const o of outcomes) {
    latencies.push(o.latencyNs);
    if (o.transportError) {
      transportErrors += 1;
      if (transportSamples.length < 3) {
        transportSamples.push(o.transportError);
      }
    } else if (o.rateLimited) {
      expectedRateLimited += 1;
    } else if (o.ok) {
      success += 1;
    } else if (o.unexpectedStatus !== null) {
      unexpectedStatus += 1;
      unexpectedStatuses.push(o.unexpectedStatus);
    }
  }

  const wallEnd = process.hrtime.bigint();
  const elapsedMs = Number(wallEnd - wallStart) / 1e6;
  const latency = summarizeLatencies(latencies);

  console.log(
    JSON.stringify(
      {
        mode: 'http',
        baseUrl: config.baseUrl,
        path: config.path,
        pattern: config.pattern,
        requests: config.requests,
        concurrency: config.concurrency,
        success,
        expectedRateLimited,
        unexpectedStatus,
        unexpectedStatusSamples: unexpectedStatuses.slice(0, 5),
        transportErrors,
        transportErrorSamples: transportSamples,
        elapsedMs: Number(elapsedMs.toFixed(3)),
        throughputRps:
          elapsedMs > 0
            ? Number(((config.requests / elapsedMs) * 1000).toFixed(2))
            : null,
        latency,
        identityNote:
          'many-clients requires ALLOW_TEST_CLIENT_ID=true and NODE_ENV=development|test; otherwise distinct X-Test-Client-Id values share the IP bucket',
        note: 'Observational only; 429 is expectedRateLimited, not an error. Do not compare with core-bench.',
      },
      null,
      2,
    ),
  );

  if (transportErrors > 0) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
