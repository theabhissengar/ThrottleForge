# ThrottleForge

**A locally runnable API rate-limiting engine built with NestJS, Redis, and Node.js.**

ThrottleForge explores how rate-limiting algorithms behave under different traffic patterns, how quotas can be shared across application instances, and how enforcement systems behave when their backing store fails.

It combines a reusable algorithm core, an HTTP integration, reproducible comparison tools, optional Redis-backed fixed-window quotas, Prometheus metrics, and a read-only dashboard.

[**Live Dashboard**](https://throttleforge.vercel.app/) · [Algorithm Lab](https://throttleforge.vercel.app/compare) · [Benchmark History](https://throttleforge.vercel.app/benchmarks) · [Adaptive Explorer](https://throttleforge.vercel.app/adaptive)

> **Project status:** Engineering prototype and learning project. Review the documented limitations before using it to protect production traffic.

## What it does

- **Three rate-limiting algorithms:** Fixed window, weighted sliding-window counter, and token bucket, with deterministic core-level comparisons.
- **Optional Redis-backed quotas:** Share fixed-window quota state across API instances using an atomic Redis operation.
- **Explicit failure policies:** Choose fail-open or fail-closed behavior when Redis operations fail, with documented response semantics.
- **Prometheus metrics:** Inspect process-local allow, rejection, store-failure, degraded-admission, and latency metrics.
- **Reproducible experiments:** Run core, HTTP, Redis comparison, and adaptive-budget load tools.
- **Automated testing:** Exercise policy validation, boundary conditions, concurrency, HTTP behavior, and simulated Redis failures.
- **Read-only dashboard:** Explore API health, observed metrics, algorithm comparisons, benchmark results, and recorded adaptive experiments.

## Architecture

```text
ThrottleForge
├── apps/
│   ├── api/          NestJS HTTP API and rate-limiting engine
│   └── web/          Next.js dashboard
├── docs/             Architecture and engineering decisions
├── tools/
│   └── load-gen/     Load generation and algorithm comparisons
├── docker-compose.yml
└── package.json      npm workspace scripts
```

The algorithm core lives in `apps/api/src/core` and has no NestJS imports. This separates the rate-limiting logic from the HTTP framework.

The HTTP integration currently enforces **fixed-window rate limiting only**. Sliding-window and token-bucket implementations are available for core-level experimentation; Redis-backed shared quotas are fixed-window only.

The dashboard reads the API over HTTP. It does not control live rate limits or place the adaptive experiment on the request path.

## Quick start

### Prerequisites

- Node.js LTS
- npm

Clone the repository and install dependencies:

```bash
git clone https://github.com/theabhissengar/ThrottleForge.git
cd ThrottleForge
npm install
```

Start the API:

```bash
npm run start:dev
```

API: `http://localhost:3000`

In a separate terminal, start the dashboard:

```bash
npm run dev:web
```

Dashboard: `http://localhost:3001`

To start both development processes together, use:

```bash
npm run dev:stack
```

Run the test suite from the repository root:

```bash
npm test
```

Redis is optional for the default development setup and standard test suite.

## API endpoints

| Endpoint | Purpose | Rate limited? |
|---|---|---|
| `GET /health` | Process health check | No |
| `GET /metrics` | Prometheus text metrics | No |
| `GET /api/rate-limit/policy` | Read-only active policy snapshot | No |
| `GET /api/demo` | Demonstration endpoint | Yes |

An allowed request returns `200` with rate-limit headers. An over-limit request returns `429` with `Retry-After` and rate-limit headers.

When Redis is enabled, store failures follow the configured fail-open or fail-closed policy.

## Explore the algorithms

| Algorithm | Key characteristic | Available in HTTP integration? |
|---|---|---|
| Fixed window | Simple calendar-aligned quotas | Yes |
| Weighted sliding-window counter | Reduces boundary-burst effects | No |
| Token bucket | Supports bursts with gradual refill | No |

Compare algorithm behavior with identical simulated traffic:

```bash
npm run load:compare -- --scenario boundary-burst --limit 10 --windowMs 1000
```

For more scenarios and load-tool options, see [`tools/load-gen`](tools/load-gen/README.md).

## Redis-backed quotas

The optional Redis store uses an atomic Lua operation to enforce shared fixed-window quotas across API instances configured with the same Redis URL, key prefix, limit, and window.

Start Redis locally with Docker Compose:

```bash
docker compose up -d redis
```

Configure the API environment:

```bash
RATE_LIMIT_STORE=redis
REDIS_URL=redis://127.0.0.1:6379
```

Run the dedicated Redis tests:

```bash
npm run test:redis
```

The Redis integration is optional; the in-memory store remains the default.

## Engineering and reliability

ThrottleForge documents and tests several important rate-limiting concerns:

- Window-boundary behavior and algorithm trade-offs.
- Deterministic tests using a controllable clock.
- Concurrent quota consumption.
- Stale-record cleanup in in-memory stores.
- Atomic Redis quota updates and failure handling.
- Prometheus counter and histogram semantics.
- Reproducible comparisons that distinguish correctness from machine-dependent performance.

Benchmark results should be interpreted as observations, not universal performance rankings. Results depend on workload, runtime, hardware, and configuration.

## Known limitations

ThrottleForge is not yet a production-ready managed rate-limiting service.

- In-memory quota state is process-local and can grow with active client cardinality.
- Redis-backed shared quotas are currently available for fixed-window enforcement only.
- Client identity defaults to the remote connection IP; forwarded headers are not trusted by default.
- The public metrics endpoint is unauthenticated and should be restricted to a trusted monitoring network or protected by appropriate infrastructure.
- The public deployment uses in-memory state; counters do not provide durable, cross-instance observability.
- The dashboard includes recorded experiments and illustrative examples. These must not be mistaken for live production traffic or adaptive enforcement.
- The adaptive controller is an offline experiment and does not control HTTP requests.
- Redis failure policies have documented trade-offs, including ambiguous outcomes after command timeouts.

See [`docs/architecture.md`](docs/architecture.md) and the repository documentation for configuration, security considerations, deployment, and implementation details.

## Roadmap

The current implementation establishes the rate-limiting core, algorithm comparisons, optional Redis-backed fixed-window enforcement, metrics, load tools, and a read-only dashboard.

Potential future work should be guided by demonstrated user needs, correctness requirements, and operational evidence rather than feature count alone.

## License

MIT — see [`LICENSE`](LICENSE).
