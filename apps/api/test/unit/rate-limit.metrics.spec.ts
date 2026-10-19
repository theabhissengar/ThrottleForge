import { InvalidPolicyError } from '../../src/core';
import { FakeClock } from '../../src/core/clock';
import { MetricObservation, RateLimitMetrics } from '../../src/metrics/metrics.interface';
import { PrometheusRateLimitMetrics } from '../../src/metrics/prometheus.metrics';
import { formatLabels } from '../../src/metrics/prometheus.registry';
import { RedisEvalClient } from '../../src/core/fixed-window.redis-store';
import {
  RateLimitConsumeResult,
  RateLimitService,
} from '../../src/rate-limit/rate-limit.service';

const REDIS_OPTIONS = {
  url: 'redis://127.0.0.1:6379',
  prefix: 'tf:fw:metrics',
  connectTimeoutMs: 200,
  commandTimeoutMs: 200,
};

class ThrowingMetrics implements RateLimitMetrics {
  recordAllow(_observation: MetricObservation): void {
    throw new Error('metrics allow failed');
  }
  recordReject(_observation: MetricObservation): void {
    throw new Error('metrics reject failed');
  }
  recordStoreFailure(_observation: MetricObservation): void {
    throw new Error('metrics failure failed');
  }
  recordDegraded(_observation: MetricObservation): void {
    throw new Error('metrics degraded failed');
  }
  render(): string {
    throw new Error('metrics render failed');
  }
}

class ScriptClient implements RedisEvalClient {
  constructor(private readonly fail: () => never) {}

  async eval(): Promise<unknown> {
    this.fail();
  }
}

function sampleValue(
  text: string,
  metric: string,
  labels: Record<string, string>,
): number | undefined {
  const prefix = `${metric}${formatLabels(labels)} `;
  const line = text.split('\n').find((entry) => entry.startsWith(prefix));
  if (line === undefined) {
    return undefined;
  }
  return Number(line.slice(prefix.length));
}

async function createService(input: {
  limit: number;
  metrics: RateLimitMetrics;
  store?: 'memory' | 'redis';
  onRedisError?: 'open' | 'closed';
  evalClient?: RedisEvalClient | null;
}): Promise<RateLimitService> {
  const store = input.store ?? 'memory';
  const service = new RateLimitService(
    { limit: input.limit, windowMs: 60_000 },
    new FakeClock(1_700_000_040_000),
    input.metrics,
    store,
    input.onRedisError ?? 'closed',
    store === 'redis' ? REDIS_OPTIONS : null,
    store === 'redis' ? (input.evalClient ?? null) : null,
  );
  await service.onModuleInit();
  return service;
}

function asSync(result: RateLimitConsumeResult | Promise<RateLimitConsumeResult>): RateLimitConsumeResult {
  expect(result).not.toBeInstanceOf(Promise);
  return result as RateLimitConsumeResult;
}

describe('RateLimitService metrics', () => {
  it('keeps memory consume synchronous and counts only allow and reject', async () => {
    const metrics = new PrometheusRateLimitMetrics();
    const service = await createService({ limit: 1, metrics });

    const allowed = asSync(service.consume('alice'));
    const rejected = asSync(service.consume('alice'));

    expect(allowed).toMatchObject({
      type: 'ok',
      decision: { allowed: true },
    });
    expect(rejected).toMatchObject({
      type: 'ok',
      decision: { allowed: false },
    });

    const text = metrics.render();
    expect(
      sampleValue(text, 'throttleforge_rate_limit_requests_total', {
        algorithm: 'fixed_window',
        result: 'allowed',
        store: 'memory',
      }),
    ).toBe(1);
    expect(
      sampleValue(text, 'throttleforge_rate_limit_requests_total', {
        algorithm: 'fixed_window',
        result: 'rejected',
        store: 'memory',
      }),
    ).toBe(1);
    expect(text).not.toMatch(/^throttleforge_rate_limit_store_failures_total\{/m);
    expect(text).not.toMatch(/^throttleforge_rate_limit_degraded_requests_total\{/m);
    expect(text).not.toContain('sliding_window');
    expect(text).not.toContain('token_bucket');
    expect(
      sampleValue(text, 'throttleforge_rate_limit_operation_duration_seconds_count', {
        algorithm: 'fixed_window',
        result: 'allowed',
        store: 'memory',
      }),
    ).toBe(1);
  });

  it('returns the original memory decisions when the recorder throws', async () => {
    const service = await createService({
      limit: 1,
      metrics: new ThrowingMetrics(),
    });

    const allowed = asSync(service.consume('alice'));
    const rejected = asSync(service.consume('alice'));

    expect(allowed).toMatchObject({ type: 'ok', decision: { allowed: true } });
    expect(rejected).toMatchObject({ type: 'ok', decision: { allowed: false } });
  });

  it('returns unavailable when redis fails and the recorder throws', async () => {
    const service = await createService({
      limit: 1,
      metrics: new ThrowingMetrics(),
      store: 'redis',
      onRedisError: 'open',
      evalClient: new ScriptClient(() => {
        throw new Error('connection refused');
      }),
    });

    await expect(service.consume('alice')).resolves.toEqual({
      type: 'unavailable',
    });
  });

  it('still throws InvalidPolicyError when metrics would also throw', async () => {
    const service = await createService({
      limit: 1,
      metrics: new ThrowingMetrics(),
      store: 'redis',
      evalClient: new ScriptClient(() => {
        throw new InvalidPolicyError('key must be a non-empty string');
      }),
    });

    await expect(service.consume('alice')).rejects.toBeInstanceOf(InvalidPolicyError);
  });
});
