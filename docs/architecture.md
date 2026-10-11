# ThrottleForge architecture notes

## Repository shape

ThrottleForge is an **npm workspaces** monorepo:

- `apps/api` — NestJS + TypeScript backend (current focus)
- `apps/web` — reserved for a future Next.js dashboard (not scaffolded yet)
- `packages/*` — reserved for shared libraries when a second consumer appears
- `tools/` — future load generators / benchmarks (Milestone 2+)

Root `package.json` only orchestrates workspaces and proxies scripts. Runtime dependencies live in each app.

## Rate-limiting core location

The Nest-free fixed-window core lives in **`apps/api/src/core`**.

It is not a separate workspace package yet. Extraction into `packages/rate-limiter` is justified only when a second in-repo consumer (for example `tools/`) needs the same TypeScript package by name. Until then, keeping the core inside the API avoids unnecessary package-management complexity.

The future Next.js app must **not** import `src/core` or Nest modules. It will call the API over HTTP/JSON only.

## Milestone map

| Milestone | Focus |
|-----------|--------|
| M1 | Fixed-window limiter, in-memory store, Nest HTTP, correctness tests |
| M1b | Monorepo layout (`apps/api`, npm workspaces) — this structure |
| M2 | Memory cleanup, concurrency evidence, traffic generator |
| M3 | Algorithm comparison (sliding window, token bucket) |
| M4 | Redis shared quotas; optional Docker Compose |
| M5 | Metrics / observability |
| M5b | Next.js `apps/web` dashboard over HTTP APIs |
| M6 | Adaptive policies vs static baseline |

## Explicit non-goals (early milestones)

No PostgreSQL, Redis, Docker, Kubernetes, Turborepo, or Nx in M1/M1b. No frontend scaffold until metrics justify a dashboard (M5b).
