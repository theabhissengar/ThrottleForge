# ThrottleForge

Locally runnable API rate-limiting engine in an **npm workspaces** monorepo.

**Milestone 1** implements a calendar-aligned **fixed-window** limiter with in-memory state behind a NestJS HTTP shell. The algorithm core has **no NestJS imports** and lives in `apps/api/src/core`.

**Milestone 1b** placed the Nest app under `apps/api` and configured root workspaces. A Next.js `apps/web` app is planned for a later milestone (after metrics exist) and is **not** scaffolded yet.

**Milestone 2** adds inspection-budgeted stale-record cleanup on the in-memory store and local core/HTTP load generators under `tools/load-gen`.

## Requirements

- Node.js LTS
- npm

No Redis, Docker, PostgreSQL, or cloud services for Milestone 1 / 1b / 2.

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

## Algorithm (Milestone 1)

- Globally calendar-aligned windows: `windowStart = floor(now / windowMs) * windowMs`.
- Inclusive limit: at most `limit` allows per client per window.
- Synchronous check-and-increment in one event-loop turn (no mutex; no async gap in the critical section).
- Injectable clock in the core for deterministic unit tests.

### Known fixed-window trade-off

A client may send up to `limit` requests just before a window boundary and `limit` again just after (~`2× limit` in a short span). That is an algorithmic property, not an implementation defect.

## Memory cleanup (Milestone 2)

`InMemoryStore` keeps a process-local `Map` of `{ windowStart, count }` per client.

- A record is **stale** when `record.windowStart < currentWindowStart` (the window start of the current consume).
- After each `tryConsume`, the store runs `purgeStale(windowStart, maxInspect)` with a small fixed budget (16 inspections).
- **Guarantee:** at most `maxInspect` Map entries are **examined** per purge call (operation-count bound). This is not a wall-clock time bound. Deletion count is an outcome, not the budget.
- The iterator **does not restart mid-call**; when a pass ends, the next `purgeStale` starts a new pass. Cleanup is therefore **eventual** under continued traffic, not necessarily complete in one request.
- Active-window records are never deleted by purge, so quotas and Decision fields are unchanged.
- **Active-window client cardinality remains unbounded** — many distinct clients in the *current* window still grow the Map until that window ends and sweeps catch up.
- An **idle** process performs no opportunistic cleanup until new requests arrive (no background timer).
- The store remains **process-local** (no cross-process coordination).

## Tests

From the repository root:

```bash
npm test
```

Correctness coverage:

1. **Unit** — policy validation, under/exact/over limit, multi-client, window expiry (fake clock), store `purgeStale` budgets and eventual cleanup.
2. **Concurrency** — parallel `consume()` calls; allowed count equals `limit` under a sync critical section.
3. **Integration** — HTTP `200` / `429` with exact rate-limit headers (deterministic clock), override-enabled isolation, and override-disabled shared quota.

## Load tools (Milestone 2)

Observational generators live in [`tools/load-gen`](tools/load-gen/README.md). They are **not** replacements for Jest.

```bash
npm run load:core -- --pattern one-client --requests 200 --concurrency 20 --limit 50
npm run load:http -- --baseUrl http://127.0.0.1:3000 --requests 40 --concurrency 8 --pattern one-client
```

- `--requests` ≥ 1; `--concurrency` ≥ 1 and clamped to ≤ `--requests`.
- Concurrency uses a fixed-size in-flight pool.
- HTTP mode reports `success`, `expectedRateLimited` (429), `unexpectedStatus`, and `transportErrors` separately — **429 is not an error**.
- HTTP `many-clients` needs `ALLOW_TEST_CLIENT_ID=true` and `NODE_ENV=development|test` on the running server.
- Throughput and latency percentiles are machine-dependent; do not compare core vs HTTP numbers directly.

## Prototype limitations (read before treating this as production)

- **Single process only.** Separate Node processes each keep their own Map; effective limit ≈ `limit × N`.
- **Active-window Map growth** is still unbounded by unique clients in the current window (stale entries are cleaned eventually under traffic).
- **IP identity is not an anti-abuse control** without a trusted network path.
- **No Redis / shared store** yet (planned for Milestone 4 with atomic consume semantics and an explicit fail-open vs fail-closed policy).
- Counters are **transient**; there is no relational database by design.
- **No frontend yet.** `apps/web` will communicate with the API over HTTP only (Milestone 5b).

## API package layout

- `apps/api/src/core/` — Nest-free policy, clock, store contract, fixed-window limiter, in-memory store
- `apps/api/src/rate-limit/` — Nest module, guard, identity adapter, service facade
- `apps/api/src/demo/`, `apps/api/src/health/` — sample routes
- `apps/api/test/unit`, `concurrency`, `integration`
- `tools/load-gen/` — core and HTTP load generators

## Roadmap

2. ~~Bounded memory + local traffic generator~~ (this milestone)  
3. Sliding-window / token-bucket comparison  
4. Redis shared quotas + optional Docker Compose for reproducibility  
5. Metrics / optional local Prometheus–Grafana  
5b. Next.js `apps/web` dashboard (HTTP client to the API)  
6. Adaptive policies only if measurements justify them vs a static baseline  

## License

MIT
