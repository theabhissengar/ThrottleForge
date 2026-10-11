import { Decision } from '../core/decision';

export interface RateLimitMetrics {
  recordAllow(decision: Decision): void;
  recordReject(decision: Decision): void;
}
