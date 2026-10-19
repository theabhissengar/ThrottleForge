# ThrottleForge

Locally runnable API rate-limiting engine in an **npm workspaces** monorepo.

**Milestone 1** implements a calendar-aligned **fixed-window** limiter with in-memory state behind a NestJS HTTP shell. The algorithm core has **no NestJS imports** and lives in `apps/api/src/core`.

**Milestone 1b** placed the Nest app under `apps/api` and configured root workspaces. A Next.js `apps/web` app is planned for a later milestone (after metrics exist) and is **not** scaffolded yet.

**Milestone 2** adds inspection-budgeted stale-record cleanup on the in-memory store and local core/HTTP load generators under `tools/load-gen`.

**Milestone 3** adds a weighted sliding-window counter and token bucket beside the fixed-window baseline, with Nest-free core comparisons on identical FakeClock traces. Nest HTTP remains fixed-window only.

**Milestone 4** shares that fixed-window quota across processes through Redis. The in-memory limiters stay synchronous. Redis is optional and local; the default Nest store is still memory.

## Requirements

- Node.js LTS
- npm

No PostgreSQL or cloud services. Milestone 4 can use a local Redis (Docker Compose or another local `EVAL`-capable server). Milestones 1–3 do not need it, and `npm test` does not start Redis.

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
| `RATE_LIMIT_STORE` | `memory` | `memory` or `redis`. Redis uses the async fixed-window limiter |
| `REDIS_URL` | unset | Required when `RATE_LIMIT_STORE=redis`, for example `redis://127.0.0.1:6379` |
| `RATE_LIMIT_REDIS_PREFIX` | `tf:fw:v1` | Key prefix. The full key is `{prefix}:{windowMs}:{clientId}` |
| `RATE_LIMIT_ON_REDIS_ERROR` | `closed` | `closed` returns HTTP 503. `open` returns HTTP 200 with `X-RateLimit-Mode: degraded` and no quota headers |
| `RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS` | `1000` | Connect timeout |
| `RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS` | `200` | Command timeout. A timed-out `EVAL` is not retried |

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
3. **Integration** — HTTP `200` / `429` with exact rate-limit headers (fixed-window Nest shell). Redis failures in the default suite use a fake client: 503 when closed, degraded 200 when open.
4. **Redis** — `npm run test:redis` with `REDIS_URL` set. Not part of `npm test`.

Local Redis:

```bash
docker compose up -d redis
```

Without Docker, any local Redis 6+ that accepts `EVAL` works (Memurai, WSL `redis-server`). There is no hosted Redis requirement.

```powershell
$env:REDIS_URL = "redis://127.0.0.1:6379"
npm run test:redis
```

## Load tools (Milestone 2–3)

Observational generators live in [`tools/load-gen`](tools/load-gen/README.md). They are **not** replacements for Jest.

```bash
npm run load:compare -- --scenario boundary-burst --limit 10 --windowMs 1000
npm run load:core -- --pattern one-client --requests 200 --concurrency 20 --limit 50 --algorithm sliding
npm run load:http -- --baseUrl http://127.0.0.1:3000 --requests 40 --concurrency 8 --pattern one-client
```

- `load:compare` generates one trace and replays it on all three algorithms (correctness vs observational metrics separated).
- `load:redis-compare` replays one fixed-window trace on memory and Redis. Matching `allowed`, `remaining`, and `resetAt` is the correctness check. The tool keeps Redis keys for at least 30 seconds during that replay so a 1ms logical remainder cannot expire between events. Printed latency is not a ranking. It does not compare outages.

```powershell
$env:REDIS_URL = "redis://127.0.0.1:6379"
npm run load:redis-compare -- --scenario boundary-burst --limit 10 --windowMs 1000
npm run load:redis-compare -- --scenario sustained-over --limit 10 --windowMs 1000
```

Two API processes share a quota when both use the same Redis URL, prefix, limit, and window:

```powershell
$env:RATE_LIMIT_STORE = "redis"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:RATE_LIMIT = "5"
$env:PORT = "3000"
npm run start:dev
```

Start a second process with `PORT=3001` and the same Redis settings.

- `--algorithm` on `load:core`: `fixed` \| `sliding` \| `token-bucket`.
- Throughput and latency are machine-dependent; do not treat comparison output as a performance ranking.

## Prototype limitations (read before treating this as production)

- **In-memory stores are single-process.** Separate Node processes each keep their own Map unless `RATE_LIMIT_STORE=redis`. With Redis, fixed-window quotas are shared. Sliding window and token bucket stay in memory.
- **Redis outages.** `closed` (default) answers **503** with no rate-limit headers and no `Retry-After`. `open` answers **200** with only `X-RateLimit-Mode: degraded` and omits `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`, because the shared count is unknown. A connection failure means the script did not run. A command timeout means the script may already have run: fail-closed can under-admit if the script allowed, and fail-open can over-admit if the script did not run or had rejected. Node does not send a follow-up write. If `PEXPIRE` and the in-script restore both fail, Redis 6 can leave a key with no TTL; Redis 7 rolls that script back. The next successful consume still replaces a stale window and sets a TTL.
- **Active-window Map growth** is still unbounded by unique clients in the current window (stale entries are cleaned eventually under traffic).
- **IP identity is not an anti-abuse control** without a trusted network path.
- **Redis is fixed-window only.** One Lua `EVAL` checks, increments only on allow, resets a stale window, and sets a relative TTL. Instances need synchronized clocks. Active keys in the current window are still unbounded; expiry removes idle windows.
- Counters are **transient**; there is no relational database by design.
- **No frontend yet.** `apps/web` will communicate with the API over HTTP only (Milestone 5b).

## API package layout

- `apps/api/src/core/` — Nest-free policy, clock, Decision, fixed/sliding/token-bucket limiters, in-memory stores, and the Redis fixed-window store
- `apps/api/src/rate-limit/` — Nest module, guard, identity adapter, service facade, optional ioredis client
- `apps/api/src/demo/`, `apps/api/src/health/` — sample routes
- `apps/api/test/unit`, `concurrency`, `integration`
- `tools/load-gen/` — core bench, algorithm compare, Redis fixed-window compare, HTTP load generators

## Roadmap

2. ~~Bounded memory + local traffic generator~~  
3. ~~Sliding-window / token-bucket comparison~~  
4. ~~Redis shared fixed-window quotas + optional Docker Compose~~ (this milestone)  
5. Metrics / optional local Prometheus–Grafana  
5b. Next.js `apps/web` dashboard (HTTP client to the API)  
6. Adaptive policies only if measurements justify them vs a static baseline  

## License

MIT
