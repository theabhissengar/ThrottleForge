# ThrottleForge architecture notes

## Repository shape

ThrottleForge is an **npm workspaces** monorepo:

- `apps/api` — NestJS + TypeScript backend (current focus)
- `apps/web` — Next.js dashboard. It calls the API over HTTP only and does not import `src/core` or Nest modules.
- `packages/*` — reserved for shared libraries when a second consumer appears
- `tools/load-gen` — Core/HTTP load generators and M3 algorithm comparison (relative import into `apps/api/src/core`; not a separate workspace package yet)

Root `package.json` orchestrates workspaces, proxies API scripts, and exposes `load:core` / `load:compare` / `load:adaptive` / `load:http`.

## Rate-limiting core location

The Nest-free rate-limiting core lives in **`apps/api/src/core`**.

It is not a separate workspace package yet. Extraction into `packages/rate-limiter` is justified only when a second in-repo consumer needs the same TypeScript package by name. `tools/load-gen` currently imports the core via a relative path to avoid that package split.

`apps/web` must **not** import `src/core` or Nest modules. It calls the API over HTTP/JSON only.

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
| M4 | Redis shared fixed-window quotas; optional Docker Compose |
| M5 | Metrics / observability |
| M5b / M7 | Next.js `apps/web` dashboard over HTTP. Read-only. No database. Adaptive control stays off the HTTP path |
| M6 | Adaptive global-budget experiment. The pre-registered comparison passed. The controller is not mounted on HTTP or Redis |
| M8 | Deployment packaging. Docker Compose runs Next.js and the Nest API on a private network, memory store by default, Redis and Caddy as profiles. The public probe stays off. Production Overview shows a labelled example of the configured limit instead of sending requests. See the README deployment section |

## Explicit non-goals (early milestones)

No PostgreSQL, Kubernetes, Turborepo, or Nx. Redis and Docker Compose are optional in M4 and are not required for M1–M3 or for `npm test`. No frontend scaffold until metrics justify a dashboard (M5b, delivered in M7 as read-only `apps/web`). Load tools remain observational and must not replace Jest correctness tests. No Nest algorithm switch and no sliding-window log. Redis is fixed-window only.

## Redis fixed window (Milestone 4)

- Key: `{prefix}:{windowMs}:{clientId}` (default prefix `tf:fw:v1`). Hash fields `w` and `c`. `limit` is a script argument, so changing it applies to the current count.
- One `EVAL` script. It increments only when the request is allowed, never past `limit`, and resets `w` when the stored window does not match. TTL is `max(1, resetAt - now)` via `PEXPIRE` (relative, so a past test clock does not delete the key on a live Redis clock).
- Script atomicity stops other clients from interleaving. It is not a rollback on Redis 6. If `PEXPIRE` fails, the script deletes a new key or restores the previous hash and TTL, then returns an error. Node maps that error to store unavailable and does not send another write. If that in-script restore also fails, Redis 6 can leave a hash with no TTL. Redis 7 undoes the script when it returns an error. A crash or timeout can still stop the script early.
- `RATE_LIMIT_ON_REDIS_ERROR=closed` (default): HTTP 503, no quota headers, no `Retry-After`. `open`: HTTP 200, header `X-RateLimit-Mode: degraded`, quota headers omitted. The shared remaining count is not invented.
- Connection failure: the script did not run. Command timeout: it may already have run. `maxRetriesPerRequest` is 0 and the offline queue is off, so the timed-out `EVAL` is not replayed. Fail-closed can under-admit when the script had allowed. Fail-open can over-admit when it did not run or had rejected.
- Default Nest store remains `InMemoryStore`. `npm run test:redis` is the suite that needs `REDIS_URL`.

## Metrics (Milestone 5)

`GET /metrics` returns Prometheus text from a process-local registry. It is not rate limited. Production deployments should restrict it to localhost or a trusted monitoring network unless public exposure is explicitly intended. M5 does not add authentication or extra middleware for that route.

Series, all low-cardinality:

- `throttleforge_rate_limit_requests_total` — completed limiter decisions. Labels: `store`, `algorithm`, `result` (`allowed` or `rejected`).
- `throttleforge_rate_limit_operation_duration_seconds` — histogram of `limiter.consume` only. Labels: `store`, `algorithm`, `result` (`allowed`, `rejected`, or `unavailable`). Buckets are cumulative: an observation increments every bound `le` where the value is less than or equal to `le`, plus `+Inf`, `_sum`, and `_count`.
- `throttleforge_rate_limit_store_failures_total` — the store returned no decision. Labels: `store`, `algorithm`.
- `throttleforge_rate_limit_degraded_requests_total` — fail-open admission after that failure. Labels: `store`, `algorithm`. A fail-closed 503 increments store failures only. Degraded means the store failed and the request was admitted anyway; it is not an allowed quota decision.

The HTTP path records `algorithm="fixed_window"` only. `store` is `memory` or `redis`. Client ids, IP addresses, request ids, URLs, and Redis error text are never labels. Idle scrapes include `HELP` and `TYPE` without samples; a missing sample means zero.

Recording happens after the limiter has already returned. A throw from the recorder is dropped and cannot change an allow, reject, or unavailable outcome. The in-memory `consume` path stays synchronous and does not add network or filesystem I/O. Limiter and policy errors are not caught by that isolation. `render()` is a memory read; if it throws, the scrape fails and quota state is unchanged.

## Adaptive global budget (Milestone 6)

`createAdaptiveState` / `applyAdaptiveUpdate` in `apps/api/src/core/adaptive-policy.ts` are a pure controller. They do not read a clock, store, or capacity. `npm run load:adaptive` builds one ordered trace per scenario and replays it from index 0 on a fresh in-memory fixed-window counter for every runner. A window closes when the next event has a larger calendar start, or when the trace ends. The limit in force during the window is the limit before that update. Global runners use the key `global`. The per-client fixed-window column at limit 8 is orientation only.

Frozen parameters: `floor = 1`, `initial = 1`, `ceiling = 32`, decrease `max(floor, floor(limit / 2))`, increase `+1` only when the window was saturated and healthy, and one hold after a decrease. The plant sets `congested` only when `admitted > C`. Rejects are not congestion. `windowMs` stays 1000.

Pass set: steady, burst, sustained overload, recovery, and capacity change. Mixed clients are reported and left out of the mean. Regret is `shortfall + excess`, with `shortfall = max(0, min(offered, C) - admitted)` and `excess = max(0, admitted - C)`. The score is the unweighted mean of regret divided by offered requests. The run passes when the adaptive mean is strictly below both the static floor and the static ceiling. The oracle, a static limit equal to the scenario's initial `C`, is printed and is not required to lose.

Recorded regrets (adaptive / floor / ceiling / oracle):

| Scenario | Adaptive | Floor | Ceiling | Oracle |
|----------|----------|-------|---------|--------|
| steady | 6 | 24 | 0 | 0 |
| burst | 10 | 28 | 24 | 0 |
| sustained overload | 28 | 56 | 192 | 0 |
| recovery | 18 | 36 | 72 | 0 |
| capacity change | 102 | 132 | 48 | 48 |

Printed means from the verified run: adaptive `0.21637605042016808`, floor `0.456281512605042`, ceiling `0.34344537815126047`, oracle `0.05`. `correctness.conclusion` was `passed`. Both comparisons held, and the pass-set regrets, adaptive limits, and admitted series matched the hand calculation. Steady ceiling regret is 0. Capacity change favors the ceiling (48 versus 102). The mean still favors adaptive because the ceiling's overload and recovery excess is larger. On mixed traffic the adaptive limits stay at or below 8, so all 36 admits go to `ip:heavy` and the four light clients get 0. That global prefix is not a fairness scheduler.

Wall-clock time in the tool is observational and is not part of the pass. A thrown trace or a hand mismatch is a verification defect: the process returns nonzero and does not record an experimental conclusion. A negative experiment is recorded only after those assertions pass and a comparison then fails. This run did not take that path. Parameters were not retuned.

**Stage 3 decision: do not mount this controller.** The demo route does no work, and the process has no capacity or latency SLO. M5 series do not carry a congestion bit. The plant exists only in the load tool. Wiring the controller to Nest or Redis would have no honest signal: a missing signal must freeze the limit, and the limiter's own rejects must not count as congestion. A later shared budget would also need one signal across processes. Process-local M5 counters are not that signal. No HTTP flag, Redis budget, or Prometheus gauge was added.
