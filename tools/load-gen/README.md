# Load generators (Milestone 2)

Observational tools for the Nest-free core limiter and the HTTP demo route. They are **not** substitutes for Jest correctness tests and must not gate CI on wall-clock latency or throughput.

## Requirements

- Node.js LTS
- Dependencies already installed from the monorepo root (`npm install`)
- No extra npm packages

Run from the **repository root**.

## Core bench

Uses `FixedWindowLimiter` + `InMemoryStore` + `FakeClock` (deterministic quotas and window boundaries). Wall-clock time is reported only for throughput/latency observation.

```bash
npm run load:core -- --pattern one-client --requests 200 --concurrency 20 --limit 50
npm run load:core -- --pattern many-clients --requests 100 --concurrency 10 --limit 5
npm run load:core -- --pattern same-window --requests 80 --concurrency 8 --limit 10
npm run load:core -- --pattern cross-boundary --requests 100 --concurrency 10 --limit 20 --windowMs 1000
```

| Flag | Rules |
|------|--------|
| `--requests` | Integer ≥ 1 |
| `--concurrency` | Integer ≥ 1; clamped to ≤ `--requests` |
| `--pattern` | `one-client` \| `many-clients` \| `same-window` \| `cross-boundary` |
| `--limit` | Integer ≥ 1 (default 50) |
| `--windowMs` | Integer ≥ 1 (default 60000) |

Concurrency is a fixed-size in-flight pool (at most N workers), not “fire all at once.”

`many-clients` reports `storeSizeAfterTraffic` and `storeSizeAfterWindowAdvanceAndSweep` so you can observe stale-record cleanup after the FakeClock advances.

## HTTP bench

Targets an **already-running** API. Does not start Nest itself.

```bash
# Terminal A — example server for multi-client isolation
set ALLOW_TEST_CLIENT_ID=true
set NODE_ENV=development
set RATE_LIMIT=5
npm run start:dev

# Terminal B
npm run load:http -- --baseUrl http://127.0.0.1:3000 --requests 40 --concurrency 8 --pattern one-client
npm run load:http -- --baseUrl http://127.0.0.1:3000 --requests 30 --concurrency 6 --pattern many-clients
```

| Flag | Rules |
|------|--------|
| `--baseUrl` | Origin of running API (default `http://127.0.0.1:3000`) |
| `--path` | Default `/api/demo` |
| `--requests` / `--concurrency` | Same validation as core |
| `--pattern` | `one-client` \| `many-clients` |
| `--clientId` | Shared `X-Test-Client-Id` for `one-client` |

### Response classification

| Counter | Meaning |
|---------|---------|
| `success` | HTTP 200 |
| `expectedRateLimited` | HTTP 429 (expected quota reject — **not** an error) |
| `unexpectedStatus` | Any other HTTP status |
| `transportErrors` | Network/DNS/connection failures |

### Multi-client identity

`many-clients` sends distinct `X-Test-Client-Id` values. The server honors that header **only** when `ALLOW_TEST_CLIENT_ID=true` **and** `NODE_ENV` is `development` or `test`. Otherwise all clients share the connection IP bucket and results will look like a single shared quota. Do not enable the override as a production identity source.

## Interpreting metrics

- Throughput and p50/p95/p99 are machine-dependent and noisy.
- Core and HTTP numbers are **not** comparable (HTTP includes Nest/Express and networking).
- Use Jest for correctness; use these tools for smoke/load observation and cleanup size checks.
