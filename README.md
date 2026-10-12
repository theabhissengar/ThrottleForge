# ThrottleForge

Locally runnable API rate-limiting engine in an **npm workspaces** monorepo.

**Milestone 1** implements a calendar-aligned **fixed-window** limiter with in-memory state behind a NestJS HTTP shell. The algorithm core has **no NestJS imports** and lives in `apps/api/src/core`.

**Milestone 1b** placed the Nest app under `apps/api` and configured root workspaces. A Next.js `apps/web` app is planned for a later milestone (after metrics exist) and is **not** scaffolded yet.

**Milestone 2** adds inspection-budgeted stale-record cleanup on the in-memory store and local core/HTTP load generators under `tools/load-gen`.

**Milestone 3** adds a weighted sliding-window counter and token bucket beside the fixed-window baseline, with Nest-free core comparisons on identical FakeClock traces. Nest HTTP remains fixed-window only.

## Requirements

- Node.js LTS
- npm

No Redis, Docker, PostgreSQL, or cloud services for Milestone 1 / 1b / 2 / 3.

## Repository layout

```text
throttleforge/
  apps/
    api/          # NestJS backend (@throttleforge/api)
  docs/           # Architecture notes
  tools/
    load-gen/     # Core + HTTP load generators (observational)
  package.json    # Workspace root (script proxies)
```

See [docs/architecture.md](docs/architecture.md) for monorepo decisions and roadmap.

## Quick start

Install once from the **repository root**:

```bash
npm install
npm run start:dev
```

Root scripts proxy to `@throttleforge/api`. Default listen address: `http://localhost:3000`

| Route | Rate limited? |
|-------|----------------|
| `GET /health` | No |
| `GET /api/demo` | Yes |

### Configuration (environment)

Set variables when starting the API (from root or `apps/api`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `RATE_LIMIT` | `5` | Max requests per window per client |
| `RATE_WINDOW_MS` | `60000` | Window length in milliseconds |
| `ALLOW_TEST_CLIENT_ID` | unset | Set to `true` **and** use `NODE_ENV=test` or `development` to honor `X-Test-Client-Id` |
| `NODE_ENV` | `development` | Gates the test identity override |

Example:

```bash
RATE_LIMIT=3 RATE_WINDOW_MS=10000 npm run start:dev
```

## Identity and trust

- Default client key: remote connection IP (`ip:<address>`). If no connection IP is available, the key is `ip:unknown` (shared bucket).
- `X-Forwarded-For` is **not** trusted by default (no trusted-proxy configuration in M1).
- Optional header `X-Test-Client-Id` is honored **only** when `ALLOW_TEST_CLIENT_ID` is exactly `true` **and** `NODE_ENV` is `test` or `development`. Do not enable this as a production identity source.
- The Nest-free core accepts an optional `now` on `consume` for deterministic tests; the HTTP layer does not expose that parameter.

## Rate-limit responses

- **Allow:** `200` plus informational headers:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset` (Unix epoch **seconds**)
- **Reject:** `429` with `Retry-After` (integer seconds) and the same `X-RateLimit-*` headers (`Remaining` is `0`).

## Algorithms

### Fixed window (Milestone 1 — Nest default)

- Globally calendar-aligned windows: `windowStart = floor(now / windowMs) * windowMs`.
- Inclusive limit: at most `limit` allows per client per window.
- Synchronous check-and-increment in one event-loop turn (no mutex; no async gap in the critical section).
- Injectable clock in the core for deterministic unit tests.

**Trade-off:** a client may send up to `limit` requests just before a window boundary and `limit` again just after (~`2× limit` in a short span).

### Weighted sliding-window counter (Milestone 3)

- `estimate = prevCount * (1 - elapsed / windowMs) + currCount`.
- Allow iff pre-request `estimate < limit`.
- Softens the fixed-window boundary burst; O(1) memory per client (not a request log).
- `remaining` is the exact count of further allows at the same frozen `now` (`max(0, ceil(limit - estimate) - 1)`), not a future-time guarantee.
- Reject `resetAt` may fall mid-window when previous-window weight decays.

### Token bucket (Milestone 3)

- Policy-equivalent mapping: `capacity = limit`, `refillPerMs = limit / windowMs` (`tokenBucketFromWindow`).
- Refill then consume; allow iff `tokens >= 1`; float balances without premature rounding.
- Burst up to capacity, then sustained ≈ `limit / windowMs`.
- Reject `resetAt` is the earliest ms when one token is available again.

### When to use which

| Need | Prefer |
|------|--------|
| Simple calendar quotas, Nest HTTP today | Fixed window |
| Reduce boundary double-spend without log memory | Sliding weighted |
| Explicit burst + smooth refill | Token bucket |

Equal allow counts across algorithms under the same `limit`/`windowMs` are **not** expected — compare behavior, not “accuracy scores.”

## Memory cleanup (Milestone 2–3)

Each in-memory algorithm store uses opportunistic `purgeStale` with inspection budget 16, no mid-call iterator restart, and eventual cleanup under traffic (no idle timer). Decision fields are unchanged by purge of unrelated keys.

| Store | Stale when |
|-------|------------|
| `InMemoryStore` (fixed) | `windowStart < currentWindowStart` |
| `SlidingWindowStore` | `currWindowStart < C - windowMs` (keep current + previous windows) |
| `TokenBucketStore` | virtual refill would already reach `capacity` (never purge a not-yet-full depleted bucket) |

Active client cardinality in the live horizon remains unbounded. Stores are process-local.

## Tests

From the repository root:

```bash
npm test
```

Correctness coverage:

1. **Unit** — policy validation (FW/SW/TB), under/exact/over quota, fractional SW `remaining`, TB refill/`resetAt±1`, multi-client, FakeClock boundaries, store purge budgets.
2. **Concurrency** — parallel `consume()` for fixed, sliding, and token-bucket; allowed count matches sync inventory.
3. **Integration** — HTTP `200` / `429` with exact rate-limit headers (fixed-window Nest shell).

## Load tools (Milestone 2–3)

Observational generators live in [`tools/load-gen`](tools/load-gen/README.md). They are **not** replacements for Jest.

```bash
npm run load:compare -- --scenario boundary-burst --limit 10 --windowMs 1000
npm run load:core -- --pattern one-client --requests 200 --concurrency 20 --limit 50 --algorithm sliding
npm run load:http -- --baseUrl http://127.0.0.1:3000 --requests 40 --concurrency 8 --pattern one-client
```

- `load:compare` generates one trace and replays it on all three algorithms (correctness vs observational metrics separated).
- `--algorithm` on `load:core`: `fixed` \| `sliding` \| `token-bucket`.
- Throughput and latency are machine-dependent; do not treat comparison output as a performance ranking.

## Prototype limitations (read before treating this as production)

- **Single process only.** Separate Node processes each keep their own Map; effective limit ≈ `limit × N`.
- **Active-window Map growth** is still unbounded by unique clients in the current window (stale entries are cleaned eventually under traffic).
- **IP identity is not an anti-abuse control** without a trusted network path.
- **No Redis / shared store** yet (planned for Milestone 4 with atomic consume semantics and an explicit fail-open vs fail-closed policy).
- Counters are **transient**; there is no relational database by design.
- **No frontend yet.** `apps/web` will communicate with the API over HTTP only (Milestone 5b).

## API package layout

- `apps/api/src/core/` — Nest-free policy, clock, Decision, fixed/sliding/token-bucket limiters and stores
- `apps/api/src/rate-limit/` — Nest module, guard, identity adapter, service facade (fixed-window)
- `apps/api/src/demo/`, `apps/api/src/health/` — sample routes
- `apps/api/test/unit`, `concurrency`, `integration`
- `tools/load-gen/` — core bench, algorithm compare, HTTP load generators

## Roadmap

2. ~~Bounded memory + local traffic generator~~  
3. ~~Sliding-window / token-bucket comparison~~ (this milestone)  
4. Redis shared quotas + optional Docker Compose for reproducibility  
5. Metrics / optional local Prometheus–Grafana  
5b. Next.js `apps/web` dashboard (HTTP client to the API)  
6. Adaptive policies only if measurements justify them vs a static baseline  

## License

MIT
