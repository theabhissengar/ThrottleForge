# ThrottleForge

Locally runnable API rate-limiting engine in an **npm workspaces** monorepo.

**Milestone 1** implements a calendar-aligned **fixed-window** limiter with in-memory state behind a NestJS HTTP shell. The algorithm core has **no NestJS imports** and lives in `apps/api/src/core`.

**Milestone 1b** placed the Nest app under `apps/api` and configured root workspaces.

**Milestone 2** adds inspection-budgeted stale-record cleanup on the in-memory store and local core/HTTP load generators under `tools/load-gen`.

**Milestone 3** adds a weighted sliding-window counter and token bucket beside the fixed-window baseline, with Nest-free core comparisons on identical FakeClock traces. Nest HTTP remains fixed-window only.

**Milestone 4** shares that fixed-window quota across processes through Redis. The in-memory limiters stay synchronous. Redis is optional and local; the default Nest store is still memory.

**Milestone 5** adds a process-local Prometheus text endpoint at `GET /metrics` for fixed-window allows, rejections, consume latency, store failures, and fail-open admissions. Restrict that route to localhost or a trusted monitoring network unless public exposure is explicitly intended.

**Milestone 6** compares a rule-based global admission budget with static floor and ceiling limits on identical in-memory traces. The pre-registered comparison passed. The controller is not on the HTTP path: this API has no capacity signal to drive it.

**Milestone 7** adds a read-only Next.js dashboard at `apps/web`. It scrapes this API over HTTP and displays committed load-tool transcripts. It does not change rate limits or mount the adaptive controller.

## Requirements

- Node.js LTS
- npm

No PostgreSQL or cloud services. Milestone 4 can use a local Redis (Docker Compose or another local `EVAL`-capable server). Milestones 1–3 do not need it, and `npm test` does not start Redis.

## Repository layout

```text
throttleforge/
  apps/
    api/          # NestJS backend (@throttleforge/api)
    web/          # Next.js dashboard (@throttleforge/web)
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

Root scripts proxy to `@throttleforge/api`. The process binds `0.0.0.0`. Local URL: `http://127.0.0.1:3000`

The dashboard is a second process on port **3001**. It does not replace `npm run start:dev`.

```bash
npm run dev:web
```

Open `http://127.0.0.1:3001`. Optional: `npm run dev:stack` runs the API watch process and the dashboard together. `THROTTLEFORGE_API_ORIGIN` in `apps/web/.env` defaults to `http://127.0.0.1:3000` when unset. See `apps/web/.env.example`. The dashboard calls `GET /health`, `GET /metrics`, and `GET /api/rate-limit/policy` through its own server. The Request demonstration also calls `GET /api/demo` from that server. Redis is not required when the API uses the default memory store.

| Route | Rate limited? |
|-------|----------------|
| `GET /health` | No |
| `GET /metrics` | No |
| `GET /api/demo` | Yes |

`GET /metrics` is Prometheus text (`text/plain; version=0.0.4`). It reports aggregate fixed-window series only: allowed and rejected decisions, consume latency, Redis store failures, and fail-open admissions. Labels are `store` (`memory` or `redis`), `algorithm` (`fixed_window` on this HTTP path), and `result` where the series has one. Client ids, IP addresses, request ids, and URLs are not labels. A missing sample means zero. Histogram buckets are cumulative. Fail-open responses increment the degraded series and the store-failure series; they are not counted as allowed. Production deployments should restrict `/metrics` to localhost or a trusted monitoring network unless public exposure is explicitly intended. This milestone does not add authentication for that route.

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
- **Redis fail-closed:** `503` with message `Rate limit store unavailable`. Quota headers and `Retry-After` are omitted.
- **Redis fail-open:** `200` with only `X-RateLimit-Mode: degraded`. Quota headers are omitted because the shared count is unknown.

### Policy snapshot

`GET /api/rate-limit/policy` is read-only. It reports the fixed-window policy the HTTP guard is enforcing. It does not consume quota, change policy, or check that Redis is reachable.

```json
{
  "algorithm": "fixed_window",
  "limit": 5,
  "windowMs": 60000,
  "store": "memory",
  "redisErrorPolicy": "closed",
  "testClientOverrideEnabled": false
}
```

`algorithm` is `fixed_window` on this HTTP path. `store` is the configured implementation, `memory` or `redis`. `redisErrorPolicy` is `open` or `closed`. `testClientOverrideEnabled` is true only when `ALLOW_TEST_CLIENT_ID=true` and `NODE_ENV` is `test` or `development`. The response does not include a Redis URL, prefix, timeout, or credential. Other HTTP methods are not accepted.

### Request demonstration

The web app can send exactly 10 sequential `GET /api/demo` requests through `POST /api/demo-probe` with the body `{ "count": 10 }`. The browser does not choose the API host. The web server calls only `THROTTLEFORGE_API_ORIGIN` plus the fixed `/api/demo` path, and it does not forward caller headers. The API therefore counts the web server’s source address, so dashboard visitors share one quota. The probe does not send `X-Test-Client-Id`.

Each upstream call times out at 2 seconds. The whole batch stops at 15 seconds and keeps responses that already finished. One Node process runs one batch at a time, then waits 30 seconds. That lock and cooldown do not coordinate other workers or replicas, and they are not a global rate limit.

An upstream `429` is a row in the batch with outcome `rate_limited`. A `429` from `POST /api/demo-probe` itself means the cooldown is active: `{ "error": "cooldown", "retryAfterSec": 30 }`. That response has no batch results. The page shows it as “Demo cooldown active”.

| `NODE_ENV` | `THROTTLEFORGE_DEMO_PROBE` | Probe |
| --- | --- | --- |
| `development`, `test`, or unset | unset or `enabled` | on |
| `development`, `test`, or unset | `disabled` or any other value | off |
| `production` | `enabled` | on, and a canonical origin is also required |
| `production` | unset, `disabled`, or any other value | off |

`THROTTLEFORGE_DEMO_PROBE=disabled` turns the probe off in every environment. In production, only the exact value `enabled` turns it on. Any other value leaves it off.

The production Compose stack leaves the probe unset. Overview does not offer Run demonstration. It shows a separate example of the configured limit: one example allow for each unit of that limit, then one example rejection. The page says those rows were not sent. Local development still sends the real batch of 10.

Local development accepts the probe only when the incoming request URL is `http` or `https` on `localhost`, `127.0.0.1`, or `::1`, and the `Origin` header is that exact origin. `http://127.0.0.1:3001` and `http://localhost:3001` are different origins. Production, and any deployment behind a proxy, must set `THROTTLEFORGE_CANONICAL_ORIGIN` to the browser-visible origin, for example `https://demo.example.com`. The value must be exactly that origin, with no user, path, query, or hash. `Origin`, `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` are not used to decide which origin is trusted. An invalid canonical origin, a missing `Origin`, or a mismatch rejects the probe and does not call the API.

An enabled probe generates real requests against the configured API. The process-local cooldown is not enough to call that safe for unrestricted public use. Operators who set `enabled` on a public site still need their own edge controls.

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
3. **Integration** — HTTP `200` / `429` with exact rate-limit headers (fixed-window Nest shell), plus `GET /metrics`. Redis failures in the default suite use a fake client: 503 when closed, degraded 200 when open. Those failures increment store-failure metrics and, only in open mode, the degraded metric.
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
npm run load:adaptive
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
- **`GET /metrics` is unauthenticated**, same as `/health`, and it is not behind the rate-limit guard. Restrict it to localhost or a trusted monitoring network unless public exposure is explicitly intended.
- **The dashboard scrapes this API and can run one small demonstration.** `apps/web` talks to the API over HTTP only. It does not import `apps/api/src/core`. Live charts are scrape deltas collected in the browser. The Request demonstration sends 10 real `GET /api/demo` calls and is separate from those charts. Committed comparison and adaptive figures are tool transcripts, not a production SLO. Algorithm Lab and Adaptive Explorer do not select the live HTTP algorithm, and the adaptive controller does not handle this API’s traffic.

## API package layout

- `apps/api/src/core/` — Nest-free policy, clock, Decision, fixed/sliding/token-bucket limiters, in-memory stores, and the Redis fixed-window store
- `apps/api/src/rate-limit/` — Nest module, guard, identity adapter, service facade, optional ioredis client
- `apps/api/src/demo/`, `apps/api/src/health/`, `apps/api/src/metrics/` — sample routes and the Prometheus scrape
- `apps/api/test/unit`, `concurrency`, `integration`
- `tools/load-gen/` — core bench, algorithm compare, Redis fixed-window compare, adaptive global-budget compare, HTTP load generators

## Roadmap

2. ~~Bounded memory + local traffic generator~~  
3. ~~Sliding-window / token-bucket comparison~~  
4. ~~Redis shared fixed-window quotas + optional Docker Compose~~  
5. ~~Metrics / observability (`GET /metrics`)~~  
5b. ~~Next.js `apps/web` dashboard (HTTP client to the API)~~ Read-only local dashboard. Live view is process-local Prometheus. Algorithm and adaptive pages use committed transcripts plus optional JSON import. No database and no live adaptive control.  
6. ~~Adaptive global-budget experiment~~ The in-memory comparison passed. It is not mounted on HTTP or Redis, because the API has no congestion signal.  

## Local production stack

Docker Compose runs the same apps as the quick start, with production settings and a private network. Install Docker, then from the repository root:

```bash
docker compose up --build
```

Open `http://127.0.0.1:3001`. That publish is loopback only. The API is `http://api:3000` on the Compose network and is not mapped to a host port. Redis is not started. The web service sets `THROTTLEFORGE_API_ORIGIN=http://api:3000` and `NODE_ENV=production`, so `POST /api/demo-probe` stays off. Overview then shows an example table for the configured limit. Those rows were not sent, are not quota decisions, and are not the live counters. `GET /health` on the API means the process answered. It does not check Redis.

Stop the stack with `docker compose down`.

Shared fixed-window quotas use the Redis profile. The Redis port is not published. `RATE_LIMIT_ON_REDIS_ERROR` stays `closed` unless you override it. The client does not reconnect after that connection closes, so start the API container again once Redis is back.

```powershell
$env:RATE_LIMIT_STORE = "redis"
$env:REDIS_URL = "redis://redis:6379"
docker compose --profile redis up --build
```

Caddy is an optional local profile. It proxies only to the web service on this machine. It is not the public deployment. The default site address `:80` serves HTTP. Set `THROTTLEFORGE_SITE_ADDRESS` only when you want that local proxy to use another address.

```powershell
$env:THROTTLEFORGE_SITE_ADDRESS = ":80"
docker compose --profile proxy up --build
```

### Production environment

Set these on the process. Compose already sets the values in the left-hand column for `api` and `web`.

| Variable | Production Compose | Meaning |
|----------|--------------------|---------|
| `NODE_ENV` | `production` | Disables the test client header. Leaves the request probe off unless `THROTTLEFORGE_DEMO_PROBE` is exactly `enabled` |
| `PORT` | API `3000`, web `3001` | Listen port inside the container |
| `RATE_LIMIT_STORE` | `memory` | `redis` only when you opt into the Redis profile |
| `REDIS_URL` | unset | Required only when the store is `redis`, for example `redis://redis:6379` |
| `RATE_LIMIT_ON_REDIS_ERROR` | `closed` | Unchanged fail-closed default. `open` is the existing fail-open path |
| `THROTTLEFORGE_API_ORIGIN` | `http://api:3000` | Server-side origin. The browser does not choose it |
| `THROTTLEFORGE_DEMO_PROBE` | unset | Production probe stays off |
| `THROTTLEFORGE_CANONICAL_ORIGIN` | unset | Required only if the probe is explicitly enabled |
| `THROTTLEFORGE_SITE_ADDRESS` | unset until the proxy profile | Caddy site address, such as a hostname or `:80` |

`ALLOW_TEST_CLIENT_ID` stays unset. `X-Forwarded-For` is not trusted. Do not commit `.env` files.

### Public host

The public dashboard is a Vercel project for `apps/web`. The public API is one Render free web service built from the repository root. Redis stays off. The production probe stays unset, so Overview keeps the labelled example and does not send live demonstration requests.

Vercel project settings:

- Root Directory: `apps/web`
- Include source files outside the Root Directory: enabled
- Node.js: 22.x
- Install command: `npm ci --prefix ../.. --workspace=@throttleforge/web`
- Build command and Output Directory: leave the Next.js defaults. Do not set the output directory to `.next/standalone`.

Set `THROTTLEFORGE_API_ORIGIN` on Vercel to the Render origin only, for example `https://<render-service>.onrender.com`, with no path. Do not create a `NEXT_PUBLIC_` copy. Do not set `THROTTLEFORGE_DEMO_PROBE` or `THROTTLEFORGE_CANONICAL_ORIGIN`.

Render uses [render.yaml](render.yaml). The service root is the repository root. Build with `npm ci --include=dev && npm run build -w @throttleforge/api && npm prune --omit=dev`. The install includes dev dependencies because `NODE_ENV=production` would otherwise omit the Nest CLI. The prune removes them after `dist` is built. Start with `npm run start:prod -w @throttleforge/api`. `NODE_VERSION` is 22. The health check path is `/health`. The store is `memory`. Do not set `PORT`, `REDIS_URL`, or `ALLOW_TEST_CLIENT_ID`. Render injects `PORT`, and the API binds `0.0.0.0`. Automatic deploys stay off until a deploy is approved. This repository does not create the Vercel project or sync that Blueprint.

A free Render web service is public at its `onrender.com` URL. Hiding the origin from the browser is not access control. `GET /metrics` stays unauthenticated there. Its labels are `store`, `algorithm`, and `result` only. `GET /api/demo` is public and rate limited. The API does not trust `X-Forwarded-For`, so callers share the proxy connection's in-memory quota. That quota and the process-local metrics disappear when the free instance spins down.

The free instance sleeps after 15 minutes without inbound HTTP or WebSocket traffic and takes about one minute to wake. The dashboard still gives the upstream 2 seconds. A timeout or an HTML loading page is reported as health unreachable and policy unavailable. The page does not invent a healthy status or metric samples. A later scrape, after the process is awake, can show an empty process.

`/metrics` stays on the private network in local Compose. `GET /health` remains a process check in both places. It does not check Redis.

### Troubleshooting

- Dashboard health says unreachable: the API is stopped, still starting, or asleep, or `THROTTLEFORGE_API_ORIGIN` is not the API the web process can reach. An asleep Render service is unreachable until it answers JSON.
- `POST /api/demo-probe` returns `probe_disabled`: expected while the production probe is unset.
- Host connections to port 3000 or 6379 fail: expected. Those ports are not published.
- A Redis profile with Redis stopped: `GET /health` can still be `ok`, and `GET /api/demo` returns 503 `Rate limit store unavailable` with no quota headers.
- In-memory quotas belong to one API process. Redis shares the fixed-window quota across API processes that use the same URL, prefix, limit, and window. Sliding window, token bucket, and the adaptive controller stay off this HTTP path.

## License

MIT
