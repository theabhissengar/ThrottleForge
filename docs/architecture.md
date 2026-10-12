# ThrottleForge architecture notes

## Repository shape

ThrottleForge is an **npm workspaces** monorepo:

- `apps/api` — NestJS + TypeScript backend (current focus)
- `apps/web` — reserved for a future Next.js dashboard (not scaffolded yet)
- `packages/*` — reserved for shared libraries when a second consumer appears
- `tools/load-gen` — Milestone 2 core/HTTP load generators (relative import into `apps/api/src/core`; not a separate workspace package yet)

Root `package.json` orchestrates workspaces, proxies API scripts, and exposes `load:core` / `load:http`.

## Rate-limiting core location

The Nest-free fixed-window core lives in **`apps/api/src/core`**.

It is not a separate workspace package yet. Extraction into `packages/rate-limiter` is justified only when a second in-repo consumer needs the same TypeScript package by name. `tools/load-gen` currently imports the core via a relative path to avoid that package split.

The future Next.js app must **not** import `src/core` or Nest modules. It will call the API over HTTP/JSON only.

## In-memory store and M2 cleanup

- Shared contract: `SyncRateLimitStore.tryConsume` (sync check-and-increment). Unchanged for future Redis.
- `InMemoryStore.purgeStale(currentWindowStart, maxInspect)` is **in-memory only**.
- Stale predicate: `record.windowStart < currentWindowStart`.
- Opportunistic sweep after each `tryConsume` with `maxInspect = 16`.
- Inspection-count bound per call; no mid-call iterator restart; eventual cleanup under traffic.
- No background timer; idle processes do not sweep.
- No hard max-size eviction (would silently reset active quotas).

## Milestone map

| Milestone | Focus |
|-----------|--------|
| M1 | Fixed-window limiter, in-memory store, Nest HTTP, correctness tests |
| M1b | Monorepo layout (`apps/api`, npm workspaces) — this structure |
| M2 | Memory cleanup, concurrency evidence, traffic generator — **current** |
| M3 | Algorithm comparison (sliding window, token bucket) |
| M4 | Redis shared quotas; optional Docker Compose |
| M5 | Metrics / observability |
| M5b | Next.js `apps/web` dashboard over HTTP APIs |
| M6 | Adaptive policies vs static baseline |

## Explicit non-goals (early milestones)

No PostgreSQL, Redis, Docker, Kubernetes, Turborepo, or Nx in M1–M2. No frontend scaffold until metrics justify a dashboard (M5b). Load tools remain observational and must not replace Jest correctness tests.
