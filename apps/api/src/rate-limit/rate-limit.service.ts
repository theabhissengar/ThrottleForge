import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  Clock,
  Decision,
  FixedWindowLimiter,
  FixedWindowPolicy,
  InMemoryStore,
  SystemClock,
  validateFixedWindowPolicy,
} from '../core';
import { RateLimitMetrics } from '../metrics/metrics.interface';
import { NoopMetrics } from '../metrics/noop.metrics';
import {
  loadFixedWindowPolicyFromEnv,
  RATE_LIMIT_POLICY,
} from './rate-limit.config';

export const RATE_LIMIT_CLOCK = 'RATE_LIMIT_CLOCK';
export const RATE_LIMIT_METRICS = 'RATE_LIMIT_METRICS';

@Injectable()
export class RateLimitService implements OnModuleInit {
  private limiter!: FixedWindowLimiter;
  private readonly store = new InMemoryStore();

  constructor(
    @Inject(RATE_LIMIT_POLICY) private readonly policy: FixedWindowPolicy,
    @Inject(RATE_LIMIT_CLOCK) private readonly clock: Clock,
    @Inject(RATE_LIMIT_METRICS) private readonly metrics: RateLimitMetrics,
  ) {}

  onModuleInit(): void {
    const validated = validateFixedWindowPolicy(this.policy);
    this.limiter = new FixedWindowLimiter(
      validated,
      this.store,
      this.clock,
    );
  }

  consume(clientId: string): Decision {
    const decision = this.limiter.consume(clientId);
    if (decision.allowed) {
      this.metrics.recordAllow(decision);
    } else {
      this.metrics.recordReject(decision);
    }
    return decision;
  }

  /** Exposed for tests that need a fresh store between cases. */
  resetStoreForTests(): void {
    this.store.clear();
  }
}

export const defaultRateLimitProviders = [
  {
    provide: RATE_LIMIT_POLICY,
    useFactory: loadFixedWindowPolicyFromEnv,
  },
  {
    provide: RATE_LIMIT_CLOCK,
    useClass: SystemClock,
  },
  {
    provide: RATE_LIMIT_METRICS,
    useClass: NoopMetrics,
  },
];
