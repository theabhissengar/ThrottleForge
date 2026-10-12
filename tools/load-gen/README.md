# Load generators (Milestone 2–3)

Observational tools for Nest-free core limiters and the HTTP demo route. They are **not** substitutes for Jest correctness tests and must not gate CI on wall-clock latency or throughput.

## Requirements

- Node.js LTS
- Dependencies already installed from the monorepo root (`npm install`)
- No extra npm packages

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

## Interpreting metrics

- Throughput and p50/p95/p99 are machine-dependent and noisy.
- Core and HTTP numbers are **not** comparable.
- Use Jest for correctness; use these tools for smoke/load observation and algorithm behavior comparison.
