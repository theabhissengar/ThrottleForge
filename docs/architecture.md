# ThrottleForge architecture notes

## Repository shape

ThrottleForge is an **npm workspaces** monorepo:

- `apps/api` — NestJS + TypeScript backend (current focus)
- `apps/web` — reserved for a future Next.js dashboard (not scaffolded yet)
- `packages/*` — reserved for shared libraries when a second consumer appears
- `tools/load-gen` — Core/HTTP load generators and M3 algorithm comparison (relative import into `apps/api/src/core`; not a separate workspace package yet)

Root `package.json` orchestrates workspaces, proxies API scripts, and exposes `load:core` / `load:compare` / `load:http`.

## Rate-limiting core location

The Nest-free rate-limiting core lives in **`apps/api/src/core`**.

It is not a separate workspace package yet. Extraction into `packages/rate-limiter` is justified only when a second in-repo consumer needs the same TypeScript package by name. `tools/load-gen` currently imports the core via a relative path to avoid that package split.

The future Next.js app must **not** import `src/core` or Nest modules. It will call the API over HTTP/JSON only.

## Algorithms (Milestone 3)

Three Nest-free limiters share `RateLimiter.consume` → `Decision` and injectable clocks:

| Algorithm | Classes | Policy |
|-----------|---------|--------|
| Fixed window (baseline, Nest default) | `FixedWindowLimiter` + `InMemoryStore` / `SyncRateLimitStore` | `{ limit, windowMs }` |
| Weighted sliding-window counter | `SlidingWindowLimiter` + `SlidingWindowStore` | `{ limit, windowMs }` |
| Token bucket | `TokenBucketLimiter` + `TokenBucketStore` | `{ capacity, refillPerMs }` via `tokenBucketFromWindow` |

Do **not** force sliding/token-bucket through `SyncRateLimitStore` — that API remains fixed-window-shaped. Each algorithm owns its Map store with budgeted `purgeStale`.

Nest HTTP continues to use fixed-window only in M3 (no algorithm selection DI).

### Decision field meanings (algorithm-specific)

- **Fixed window:** `remaining = limit - count`; `resetAt` = next calendar boundary.
- **Sliding weighted:** allow iff pre-request `estimate < limit`; `remaining = max(0, ceil(limit - estimate) - 1)` (exact further allows at the same frozen `now`); reject `resetAt` may be mid-window when previous-window weight decays.
- **Token bucket:** allow iff `tokens >= 1` after refill; `remaining = floor(tokens)`; reject `resetAt` = earliest ms when balance reaches 1.

### Cleanup predicates

- Fixed: `windowStart < currentWindowStart`
- Sliding: `currWindowStart < C - windowMs` (retain current + previous calendar windows)
- Token bucket: purge when virtual refill would already reach `capacity` (recreate-equivalent); never purge a partially depleted bucket that is not yet virtually full

## In-memory store and M2 cleanup

- Shared FW contract: `SyncRateLimitStore.tryConsume` (sync check-and-increment). Unchanged for future Redis.
- `InMemoryStore.purgeStale(currentWindowStart, maxInspect)` is **in-memory only**.
- Opportunistic sweep after each consume with `maxInspect = 16`.
- Inspection-count bound per call; no mid-call iterator restart; eventual cleanup under traffic.
- No background timer; idle processes do not sweep.
- No hard max-size eviction (would silently reset active quotas).

## Milestone map

| Milestone | Focus |
|-----------|--------|
| M1 | Fixed-window limiter, in-memory store, Nest HTTP, correctness tests |
| M1b | Monorepo layout (`apps/api`, npm workspaces) — this structure |
| M2 | Memory cleanup, concurrency evidence, traffic generator |
| M3 | Algorithm comparison (sliding window, token bucket) — **current** |
| M4 | Redis shared quotas; optional Docker Compose |
| M5 | Metrics / observability |
| M5b | Next.js `apps/web` dashboard over HTTP APIs |
| M6 | Adaptive policies vs static baseline |

## Explicit non-goals (early milestones)

No PostgreSQL, Redis, Docker, Kubernetes, Turborepo, or Nx in M1–M3. No frontend scaffold until metrics justify a dashboard (M5b). Load tools remain observational and must not replace Jest correctness tests. No Nest algorithm switch and no sliding-window log in M3.
