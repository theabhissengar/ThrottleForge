import { MetricObservation, RateLimitMetrics } from './metrics.interface';

/** Records nothing. Tests can override the Nest provider with this. */
export class NoopMetrics implements RateLimitMetrics {
  recordAllow(_observation: MetricObservation): void {}
  recordReject(_observation: MetricObservation): void {}
  recordStoreFailure(_observation: MetricObservation): void {}
  recordDegraded(_observation: MetricObservation): void {}
  render(): string {
    return '';
  }
}
