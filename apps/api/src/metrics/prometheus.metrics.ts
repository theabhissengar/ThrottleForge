import {
  MetricAlgorithm,
  MetricObservation,
  MetricStore,
  RateLimitMetrics,
} from './metrics.interface';
import {
  DURATION_BUCKET_BOUNDS_SECONDS,
  PrometheusCounter,
  PrometheusHistogram,
  PrometheusRegistry,
} from './prometheus.registry';

const STORES: readonly MetricStore[] = ['memory', 'redis'];
const ALGORITHMS: readonly MetricAlgorithm[] = [
  'fixed_window',
  'sliding_window',
  'token_bucket',
];

function assertObservation(observation: MetricObservation): void {
  if (!STORES.includes(observation.store)) {
    throw new Error('metric store must be memory or redis');
  }
  if (!ALGORITHMS.includes(observation.algorithm)) {
    throw new Error('metric algorithm is not recognized');
  }
  if (
    !Number.isFinite(observation.durationSeconds) ||
    observation.durationSeconds < 0
  ) {
    throw new Error('metric duration must be a finite number >= 0');
  }
}

function identityLabels(observation: MetricObservation): {
  algorithm: MetricAlgorithm;
  store: MetricStore;
} {
  return {
    algorithm: observation.algorithm,
    store: observation.store,
  };
}

/**
 * Process-local Prometheus text for the four rate-limit families.
 * Recording and rendering touch memory only.
 */
export class PrometheusRateLimitMetrics implements RateLimitMetrics {
  private readonly registry = new PrometheusRegistry();
  private readonly requests: PrometheusCounter;
  private readonly duration: PrometheusHistogram;
  private readonly failures: PrometheusCounter;
  private readonly degraded: PrometheusCounter;

  constructor() {
    this.requests = this.registry.counter(
      'throttleforge_rate_limit_requests_total',
      'Completed limiter decisions.',
    );
    this.duration = this.registry.histogram(
      'throttleforge_rate_limit_operation_duration_seconds',
      'Seconds spent inside one limiter consume.',
      DURATION_BUCKET_BOUNDS_SECONDS,
    );
    this.failures = this.registry.counter(
      'throttleforge_rate_limit_store_failures_total',
      'Store operations that failed before a quota decision.',
    );
    this.degraded = this.registry.counter(
      'throttleforge_rate_limit_degraded_requests_total',
      'Fail-open admissions after a store failure.',
    );
  }

  recordAllow(observation: MetricObservation): void {
    assertObservation(observation);
    const labels = identityLabels(observation);
    this.requests.inc({ ...labels, result: 'allowed' });
    this.duration.observe(
      { ...labels, result: 'allowed' },
      observation.durationSeconds,
    );
  }

  recordReject(observation: MetricObservation): void {
    assertObservation(observation);
    const labels = identityLabels(observation);
    this.requests.inc({ ...labels, result: 'rejected' });
    this.duration.observe(
      { ...labels, result: 'rejected' },
      observation.durationSeconds,
    );
  }

  recordStoreFailure(observation: MetricObservation): void {
    assertObservation(observation);
    const labels = identityLabels(observation);
    this.failures.inc(labels);
    this.duration.observe(
      { ...labels, result: 'unavailable' },
      observation.durationSeconds,
    );
  }

  recordDegraded(observation: MetricObservation): void {
    assertObservation(observation);
    this.degraded.inc(identityLabels(observation));
  }

  render(): string {
    return this.registry.render();
  }
}
