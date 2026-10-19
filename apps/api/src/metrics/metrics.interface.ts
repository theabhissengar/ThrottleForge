export type MetricStore = 'memory' | 'redis';

export type MetricAlgorithm =
  | 'fixed_window'
  | 'sliding_window'
  | 'token_bucket';

export interface MetricObservation {
  store: MetricStore;
  algorithm: MetricAlgorithm;
  durationSeconds: number;
}

/**
 * In-process rate-limit metrics. Implementations must stay synchronous:
 * no network, filesystem, or other blocking I/O.
 */
export interface RateLimitMetrics {
  recordAllow(observation: MetricObservation): void;
  recordReject(observation: MetricObservation): void;
  recordStoreFailure(observation: MetricObservation): void;
  recordDegraded(observation: MetricObservation): void;
  render(): string;
}
