# Load generators (Milestone 2–3)

Observational tools for Nest-free core limiters and the HTTP demo route. They are **not** substitutes for Jest correctness tests and must not gate CI on wall-clock latency or throughput.

## Requirements

- Node.js LTS
- Dependencies already installed from the monorepo root (`npm install`)
- Redis only for `load:redis-compare` (`REDIS_URL`). `load:core`, `load:compare`, `load:adaptive`, and `load:http` do not use it.

Run from the **repository root**.

## Algorithm comparison (Milestone 3)

`compare-scenarios.ts` builds a request trace **once**, then replays the same ordered `{ clientId, atMs }` events against **fresh** state for fixed-window, weighted sliding-window, and token-bucket.

```bash
npm run load:compare -- --scenario boundary-burst --limit 10 --windowMs 1000
npm run load:compare -- --scenario sustained-over --limit 10 --windowMs 1000
npm run load:compare -- --scenario sw-decay --limit 5 --windowMs 1000
npm run load:compare -- --scenario tb-idle-burst --limit 5 --windowMs 1000
npm run load:compare -- --scenario many-clients --limit 10 --windowMs 1000
```

| Scenario | Intent |
|----------|--------|
| `sustained-under` | ~0.5× limit evenly in one window |
| `sustained-over` | 2× limit evenly |
| `boundary-burst` | `limit` at end of window + `limit` at start of next (FW ~2× spike) |
| `sw-decay` | Fill, cross boundary, probe mid-window eligibility |
| `tb-idle-burst` | Drain, wait ~`windowMs`, burst again |
| `many-clients` | Distinct clients (state size) |

**Policy mapping (same knobs, different semantics):**

| Knob | Fixed | Sliding | Token bucket |
|------|-------|---------|--------------|
| `limit` | max per calendar window | estimate threshold | `capacity` |
| `windowMs` | calendar length | calendar + decay horizon | refill horizon (`refillPerMs = limit/windowMs`) |

JSON output separates **correctness** (`allowed`, `rejected`, `unexpectedErrors`, `storeSizeAfter`) from **observational** latency/throughput. Do **not** expect equal allow counts across algorithms; deltas are semantic, not defects. Results are not a universal performance ranking.

## Core bench

Single-algorithm load against core limiters + FakeClock.

```bash
npm run load:core -- --pattern one-client --requests 200 --concurrency 20 --limit 50 --algorithm fixed
npm run load:core -- --pattern many-clients --requests 100 --concurrency 10 --limit 5 --algorithm sliding
npm run load:core -- --pattern cross-boundary --requests 100 --concurrency 10 --limit 20 --windowMs 1000 --algorithm token-bucket
```

| Flag | Rules |
|------|--------|
| `--requests` | Integer ≥ 1 |
| `--concurrency` | Integer ≥ 1; clamped to ≤ `--requests` |
| `--pattern` | `one-client` \| `many-clients` \| `same-window` \| `cross-boundary` |
| `--algorithm` | `fixed` \| `sliding` \| `token-bucket` (default `fixed`) |
| `--limit` | Integer ≥ 1 (default 50) |
| `--windowMs` | Integer ≥ 1 (default 60000) |

## HTTP bench

Targets an **already-running** API (fixed-window Nest shell). Does not start Nest itself.

```bash
# Terminal A
set ALLOW_TEST_CLIENT_ID=true
set NODE_ENV=development
set RATE_LIMIT=5
npm run start:dev

# Terminal B
npm run load:http -- --baseUrl http://127.0.0.1:3000 --requests 40 --concurrency 8 --pattern one-client
```

| Counter | Meaning |
|---------|---------|
| `success` | HTTP 200 |
| `expectedRateLimited` | HTTP 429 (expected — **not** an error) |
| `unexpectedStatus` | Any other HTTP status |
| `transportErrors` | Network/DNS/connection failures |

`many-clients` needs `ALLOW_TEST_CLIENT_ID=true` and `NODE_ENV=development|test` on the server.

After the pool finishes, the bench does one `GET /metrics` and prints `observationalMetrics` (`requestsAllowed`, `requestsRejected`, `storeFailures`, `degraded`, or `scrapeError`). That scrape is outside the latency percentiles. A scrape failure or a counter mismatch does not change the exit code. Exit code 2 still means demo-path transport errors only.

## Interpreting metrics

- Throughput and p50/p95/p99 are machine-dependent and noisy.
- Core and HTTP numbers are **not** comparable.
- Use Jest for correctness; use these tools for smoke/load observation and algorithm behavior comparison.

## Redis fixed-window comparison (Milestone 4)

Replays one ordered trace on `InMemoryStore` and on Redis. `allowed`, `remaining`, and `resetAt` must match. The Redis replay holds keys for at least 30 seconds so a 1ms logical remainder cannot expire between events; that floor is only in this tool. Printed latency and throughput are machine-dependent and are not a ranking. This does not compare Redis outages.

```powershell
docker compose up -d redis
$env:REDIS_URL = "redis://127.0.0.1:6379"
npm run load:redis-compare -- --scenario boundary-burst --limit 10 --windowMs 1000
npm run load:redis-compare -- --scenario sustained-over --limit 10 --windowMs 1000
```

`REDIS_URL` is required. Scenarios are `boundary-burst` and `sustained-over` only. The six `load:compare` scenarios stay in memory.

## Adaptive global budget (Milestone 6)

`adaptive-compare.ts` builds one deterministic trace per scenario and replays it from fresh state for five runners: adaptive, static floor (limit 1), static ceiling (limit 32), static oracle (the scenario's initial plant capacity), and a per-client fixed window at limit 8. The first four use the single key `global`. The per-client runner is labeled `per-client-fixed-window-reference` and is not a pass baseline.

```bash
npm run load:adaptive
```

The controller is `createAdaptiveState` / `applyAdaptiveUpdate`. This tool owns the plant. After each window it passes only `{ available: true, congested, saturated }`, where `congested` means admits exceeded that window's capacity. The pass set is steady, burst, sustained overload, recovery, and capacity change. Mixed clients are printed and excluded from the mean.

JSON separates `correctness` from `observational`. The correctness block has per-scenario offered, admitted, shortfall, excess, regret, normalized regret, the limit in force each window, limit updates, increase/decrease/hold counts, and per-client admits. It also has the five-scenario means and the two comparisons. Exit code 0 means the adaptive mean normalized regret is strictly below both static floor and static ceiling, and those regrets match the hand calculation. Exit code 1 leaves the parameters unchanged. `observational.elapsedMs` is not a gate. Two runs must match on `correctness`.

Recorded pass-set regrets (adaptive / floor / ceiling / oracle): steady 6/24/0/0, burst 10/28/24/0, sustained overload 28/56/192/0, recovery 18/36/72/0, capacity change 102/132/48/48. Means: adaptive about 0.2164, floor about 0.4563, ceiling about 0.3434, oracle 0.05. The comparison passed. On the mixed trace every adaptive admit went to `ip:heavy`.

The HTTP API still has no capacity signal, so this result does not turn the controller on for Nest or Redis.
