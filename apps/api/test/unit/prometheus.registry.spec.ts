import { PrometheusRateLimitMetrics } from '../../src/metrics/prometheus.metrics';
import {
  DURATION_BUCKET_BOUNDS_SECONDS,
  PrometheusRegistry,
  formatLabels,
} from '../../src/metrics/prometheus.registry';

const DURATION = 'throttleforge_rate_limit_operation_duration_seconds';
const REQUESTS = 'throttleforge_rate_limit_requests_total';

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

function expectHelpBeforeSamples(text: string, name: string, type: string): void {
  const helpAt = text.indexOf(`# HELP ${name} `);
  const typeAt = text.indexOf(`# TYPE ${name} ${type}`);
  const sampleAt = text.indexOf(`${name}{`);
  const suffixedAt = text.indexOf(`${name}_`);
  const firstSample = [sampleAt, suffixedAt]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  expect(helpAt).toBeGreaterThanOrEqual(0);
  expect(typeAt).toBeGreaterThan(helpAt);
  if (firstSample !== undefined) {
    expect(firstSample).toBeGreaterThan(typeAt);
  }
}

describe('Prometheus registry', () => {
  it('renders counter help, type, and allow/reject totals', () => {
    const metrics = new PrometheusRateLimitMetrics();
    const observation = {
      store: 'memory' as const,
      algorithm: 'fixed_window' as const,
      durationSeconds: 0.0001,
    };
    metrics.recordAllow(observation);
    metrics.recordAllow(observation);
    metrics.recordReject(observation);

    const text = metrics.render();
    expectHelpBeforeSamples(text, REQUESTS, 'counter');
    expect(text).toContain('# TYPE throttleforge_rate_limit_store_failures_total counter');
    expect(text).toContain(
      '# TYPE throttleforge_rate_limit_degraded_requests_total counter',
    );
    expect(
      sampleValue(text, REQUESTS, {
        algorithm: 'fixed_window',
        result: 'allowed',
        store: 'memory',
      }),
    ).toBe(2);
    expect(
      sampleValue(text, REQUESTS, {
        algorithm: 'fixed_window',
        result: 'rejected',
        store: 'memory',
      }),
    ).toBe(1);
    expect(text).toContain(
      'throttleforge_rate_limit_requests_total{algorithm="fixed_window",result="allowed",store="memory"} 2',
    );
  });

  it('counts a duration equal to the 0.001 bucket bound cumulatively', () => {
    const metrics = new PrometheusRateLimitMetrics();
    metrics.recordAllow({
      store: 'memory',
      algorithm: 'fixed_window',
      durationSeconds: 0.001,
    });
    const text = metrics.render();
    expectHelpBeforeSamples(text, DURATION, 'histogram');
    const labels = {
      algorithm: 'fixed_window',
      result: 'allowed',
      store: 'memory',
    };

    for (const bound of DURATION_BUCKET_BOUNDS_SECONDS) {
      expect(
        sampleValue(text, `${DURATION}_bucket`, { ...labels, le: String(bound) }),
      ).toBe(0.001 <= bound ? 1 : 0);
    }
    expect(
      sampleValue(text, `${DURATION}_bucket`, { ...labels, le: '+Inf' }),
    ).toBe(1);
    expect(sampleValue(text, `${DURATION}_sum`, labels)).toBe(0.001);
    expect(sampleValue(text, `${DURATION}_count`, labels)).toBe(1);
    expect(text).toContain(
      `${DURATION}_bucket{algorithm="fixed_window",le="0.001",result="allowed",store="memory"} 1`,
    );
    expect(text).toContain(
      `${DURATION}_bucket{algorithm="fixed_window",le="0.0005",result="allowed",store="memory"} 0`,
    );
  });

  it('leaves the 0.001 bucket unchanged for a duration of 0.0011', () => {
    const metrics = new PrometheusRateLimitMetrics();
    metrics.recordAllow({
      store: 'memory',
      algorithm: 'fixed_window',
      durationSeconds: 0.0011,
    });
    const text = metrics.render();
    const labels = {
      algorithm: 'fixed_window',
      result: 'allowed',
      store: 'memory',
    };

    for (const bound of DURATION_BUCKET_BOUNDS_SECONDS) {
      expect(
        sampleValue(text, `${DURATION}_bucket`, { ...labels, le: String(bound) }),
      ).toBe(0.0011 <= bound ? 1 : 0);
    }
    expect(
      sampleValue(text, `${DURATION}_bucket`, { ...labels, le: '+Inf' }),
    ).toBe(1);
    expect(sampleValue(text, `${DURATION}_sum`, labels)).toBe(0.0011);
    expect(sampleValue(text, `${DURATION}_count`, labels)).toBe(1);
    expect(text).toContain(
      `${DURATION}_bucket{algorithm="fixed_window",le="0.001",result="allowed",store="memory"} 0`,
    );
    expect(text).toContain(
      `${DURATION}_bucket{algorithm="fixed_window",le="0.0025",result="allowed",store="memory"} 1`,
    );
  });

  it('escapes label values and help text and keeps label order stable', () => {
    const registry = new PrometheusRegistry();
    const counter = registry.counter('demo_total', 'has\\and\nnewline');
    counter.inc({ path: 'a\\b"c\nd', algorithm: 'fixed_window' });
    const text = registry.render();

    expect(text).toContain('# HELP demo_total has\\\\and\\nnewline');
    expect(text).toContain('# TYPE demo_total counter');
    expect(text).toContain('demo_total{algorithm="fixed_window",path="a\\\\b\\"c\\nd"} 1');
    const helpAt = text.indexOf('# HELP demo_total ');
    const typeAt = text.indexOf('# TYPE demo_total counter');
    const sampleAt = text.indexOf('demo_total{');
    expect(typeAt).toBeGreaterThan(helpAt);
    expect(sampleAt).toBeGreaterThan(typeAt);
  });

  it('emits sliding-window, token-bucket, and redis labels when recorded directly', () => {
    const metrics = new PrometheusRateLimitMetrics();
    metrics.recordAllow({
      store: 'memory',
      algorithm: 'sliding_window',
      durationSeconds: 0.01,
    });
    metrics.recordReject({
      store: 'memory',
      algorithm: 'token_bucket',
      durationSeconds: 0.01,
    });
    metrics.recordAllow({
      store: 'redis',
      algorithm: 'fixed_window',
      durationSeconds: 0.01,
    });
    metrics.recordReject({
      store: 'redis',
      algorithm: 'fixed_window',
      durationSeconds: 0.02,
    });

    const text = metrics.render();
    expect(
      sampleValue(text, REQUESTS, {
        algorithm: 'sliding_window',
        result: 'allowed',
        store: 'memory',
      }),
    ).toBe(1);
    expect(
      sampleValue(text, REQUESTS, {
        algorithm: 'token_bucket',
        result: 'rejected',
        store: 'memory',
      }),
    ).toBe(1);
    expect(
      sampleValue(text, REQUESTS, {
        algorithm: 'fixed_window',
        result: 'allowed',
        store: 'redis',
      }),
    ).toBe(1);
    expect(
      sampleValue(text, REQUESTS, {
        algorithm: 'fixed_window',
        result: 'rejected',
        store: 'redis',
      }),
    ).toBe(1);
  });

  it('rejects an unrecognized algorithm before writing a sample', () => {
    const metrics = new PrometheusRateLimitMetrics();
    expect(() =>
      metrics.recordAllow({
        store: 'memory',
        algorithm: 'custom' as 'fixed_window',
        durationSeconds: 0.01,
      }),
    ).toThrow(/algorithm/);
    expect(metrics.render()).not.toContain('custom');
  });

  it('does not change series when render runs twice', () => {
    const metrics = new PrometheusRateLimitMetrics();
    metrics.recordAllow({
      store: 'memory',
      algorithm: 'fixed_window',
      durationSeconds: 0.001,
    });
    const first = metrics.render();
    const second = metrics.render();
    expect(second).toBe(first);
  });
});
