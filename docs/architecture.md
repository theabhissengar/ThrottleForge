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

- Shared FW contract: `SyncRateLimitStore.tryConsume` (sync check-and-increment). The Redis path is a separate `AsyncRateLimitStore` and does not change this signature.
- `InMemoryStore.purgeStale(currentWindowStart, maxInspect)` is **in-memory only**. Redis cleanup is key expiry.
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
| M3 | Algorithm comparison (sliding window, token bucket) |
| M4 | Redis shared fixed-window quotas; optional Docker Compose — **current** |
| M5 | Metrics / observability |
| M5b | Next.js `apps/web` dashboard over HTTP APIs |
| M6 | Adaptive policies vs static baseline |

## Explicit non-goals (early milestones)

No PostgreSQL, Kubernetes, Turborepo, or Nx. Redis and Docker Compose are optional in M4 and are not required for M1–M3 or for `npm test`. No frontend scaffold until metrics justify a dashboard (M5b). Load tools remain observational and must not replace Jest correctness tests. No Nest algorithm switch and no sliding-window log. Redis is fixed-window only.

## Redis fixed window (Milestone 4)

- Key: `{prefix}:{windowMs}:{clientId}` (default prefix `tf:fw:v1`). Hash fields `w` and `c`. `limit` is a script argument, so changing it applies to the current count.
- One `EVAL` script. It increments only when the request is allowed, never past `limit`, and resets `w` when the stored window does not match. TTL is `max(1, resetAt - now)` via `PEXPIRE` (relative, so a past test clock does not delete the key on a live Redis clock).
- Script atomicity stops other clients from interleaving. It is not a rollback on Redis 6. If `PEXPIRE` fails, the script deletes a new key or restores the previous hash and TTL, then returns an error. Node maps that error to store unavailable and does not send another write. If that in-script restore also fails, Redis 6 can leave a hash with no TTL. Redis 7 undoes the script when it returns an error. A crash or timeout can still stop the script early.
- `RATE_LIMIT_ON_REDIS_ERROR=closed` (default): HTTP 503, no quota headers, no `Retry-After`. `open`: HTTP 200, header `X-RateLimit-Mode: degraded`, quota headers omitted. The shared remaining count is not invented.
- Connection failure: the script did not run. Command timeout: it may already have run. `maxRetriesPerRequest` is 0 and the offline queue is off, so the timed-out `EVAL` is not replayed. Fail-closed can under-admit when the script had allowed. Fail-open can over-admit when it did not run or had rejected.
- Default Nest store remains `InMemoryStore`. `npm run test:redis` is the suite that needs `REDIS_URL`.
