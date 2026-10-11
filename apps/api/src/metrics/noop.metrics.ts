import { Decision } from '../core/decision';
import { RateLimitMetrics } from './metrics.interface';

/** Placeholder until Milestone 5 observability. */
export class NoopMetrics implements RateLimitMetrics {
  recordAllow(_decision: Decision): void {}
  recordReject(_decision: Decision): void {}
}
