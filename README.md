# ThrottleForge

Locally runnable API rate-limiting engine in an **npm workspaces** monorepo.

**Milestone 1** implements a calendar-aligned **fixed-window** limiter with in-memory state behind a NestJS HTTP shell. The algorithm core has **no NestJS imports** and lives in `apps/api/src/core`.

**Milestone 1b** placed the Nest app under `apps/api` and configured root workspaces. A Next.js `apps/web` app is planned for a later milestone (after metrics exist) and is **not** scaffolded yet.

## Requirements

- Node.js LTS
- npm

No Redis, Docker, PostgreSQL, or cloud services for Milestone 1 / 1b.

## Repository layout

```text
throttleforge/
  apps/
    api/          # NestJS backend (@throttleforge/api)
  docs/           # Architecture notes
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

- Default client key: remote connection IP (`ip:<address>`).
- `X-Forwarded-For` is **not** trusted by default (no trusted-proxy configuration in M1).
- Optional header `X-Test-Client-Id` is honored **only** when `ALLOW_TEST_CLIENT_ID=true` and `NODE_ENV` is `test` or `development`. Do not enable this as a production identity source.

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

## Tests

From the repository root:

```bash
npm test
```

Coverage intended for M1:

1. **Unit** — policy validation, under/exact/over limit, multi-client, window expiry (fake clock), boundary instant.
2. **Concurrency** — parallel `consume()` calls; allowed count equals `limit` under a sync critical section.
3. **Integration** — HTTP `200` then `429` + `Retry-After`, headers, test-client isolation.

Load / traffic-generator experiments are **Milestone 2**, not a substitute for these correctness tests.

## Prototype limitations (read before treating this as production)

- **Single process only.** Separate Node processes each keep their own Map; effective limit ≈ `limit × N`.
- **In-memory map is unbounded** by distinct client keys. Many rotating identities can grow memory until Milestone 2 adds safe stale-entry cleanup.
- **IP identity is not an anti-abuse control** without a trusted network path.
- **No Redis / shared store** yet (planned for Milestone 4 with atomic consume semantics and an explicit fail-open vs fail-closed policy).
- Counters are **transient**; there is no relational database by design.
- **No frontend yet.** `apps/web` will communicate with the API over HTTP only (Milestone 5b).

## API package layout

- `apps/api/src/core/` — Nest-free policy, clock, store contract, fixed-window limiter, in-memory store
- `apps/api/src/rate-limit/` — Nest module, guard, identity adapter, service facade
- `apps/api/src/demo/`, `apps/api/src/health/` — sample routes
- `apps/api/test/unit`, `concurrency`, `integration`

## Roadmap

2. Bounded memory + stronger concurrency evidence + local traffic generator  
3. Sliding-window / token-bucket comparison  
4. Redis shared quotas + optional Docker Compose for reproducibility  
5. Metrics / optional local Prometheus–Grafana  
5b. Next.js `apps/web` dashboard (HTTP client to the API)  
6. Adaptive policies only if measurements justify them vs a static baseline  

## License

MIT
