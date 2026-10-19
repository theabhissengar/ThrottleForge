import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AsyncConsumeOutcome,
  AsyncFixedWindowLimiter,
  Clock,
  Decision,
  FixedWindowLimiter,
  FixedWindowPolicy,
  InMemoryStore,
  RedisFailureMode,
  RedisFixedWindowStore,
  SystemClock,
  validateFixedWindowPolicy,
} from '../core';
import { RateLimitMetrics } from '../metrics/metrics.interface';
import { NoopMetrics } from '../metrics/noop.metrics';
import {
  ClosableRedisEvalClient,
  RedisConnectionOptions,
} from './ioredis.client';
import {
  loadFixedWindowPolicyFromEnv,
  loadRateLimitStoreKindFromEnv,
  loadRedisConnectionOptionsFromEnv,
  loadRedisFailureModeFromEnv,
  RATE_LIMIT_EVAL_CLIENT,
  RATE_LIMIT_ON_REDIS_ERROR,
  RATE_LIMIT_POLICY,
  RATE_LIMIT_REDIS_OPTIONS,
  RATE_LIMIT_STORE_KIND,
  RateLimitStoreKind,
} from './rate-limit.config';

export const RATE_LIMIT_CLOCK = 'RATE_LIMIT_CLOCK';
export const RATE_LIMIT_METRICS = 'RATE_LIMIT_METRICS';

export type RateLimitConsumeResult =
  | { type: 'ok'; decision: Decision }
  | { type: 'unavailable' };

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private syncLimiter?: FixedWindowLimiter;
  private asyncLimiter?: AsyncFixedWindowLimiter;
  private memoryStore?: InMemoryStore;

  constructor(
    @Inject(RATE_LIMIT_POLICY) private readonly policy: FixedWindowPolicy,
    @Inject(RATE_LIMIT_CLOCK) private readonly clock: Clock,
    @Inject(RATE_LIMIT_METRICS) private readonly metrics: RateLimitMetrics,
    @Inject(RATE_LIMIT_STORE_KIND) private readonly storeKind: RateLimitStoreKind,
    @Inject(RATE_LIMIT_ON_REDIS_ERROR)
    private readonly onRedisError: RedisFailureMode,
    @Inject(RATE_LIMIT_REDIS_OPTIONS)
    private readonly redisOptions: RedisConnectionOptions | null,
    @Inject(RATE_LIMIT_EVAL_CLIENT)
    private readonly evalClient: ClosableRedisEvalClient | null,
  ) {}

  async onModuleInit(): Promise<void> {
    const validated = validateFixedWindowPolicy(this.policy);
    if (this.storeKind === 'memory') {
      this.memoryStore = new InMemoryStore();
      this.syncLimiter = new FixedWindowLimiter(
        validated,
        this.memoryStore,
        this.clock,
      );
      return;
    }

    if (!this.evalClient || !this.redisOptions) {
      throw new Error('Redis client is required when RATE_LIMIT_STORE=redis');
    }
    const store = new RedisFixedWindowStore(
      this.evalClient,
      this.redisOptions.prefix,
      validated.windowMs,
    );
    this.asyncLimiter = new AsyncFixedWindowLimiter(
      validated,
      store,
      this.clock,
      this.onRedisError,
    );
    if (this.evalClient.ready) {
      try {
        await this.evalClient.ready();
      } catch {
        // The process still starts. Later consume calls use the failure policy.
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.evalClient && typeof this.evalClient.quit === 'function') {
      await this.evalClient.quit();
    }
  }

  redisErrorMode(): RedisFailureMode {
    return this.onRedisError;
  }

  consume(clientId: string): RateLimitConsumeResult | Promise<RateLimitConsumeResult> {
    if (this.syncLimiter) {
      const decision = this.syncLimiter.consume(clientId);
      this.record(decision);
      return { type: 'ok', decision };
    }
    if (!this.asyncLimiter) {
      throw new Error('Rate limiter is not initialized');
    }
    return this.consumeRedis(clientId);
  }

  /** Exposed for tests that need a fresh in-memory store between cases. */
  resetStoreForTests(): void {
    if (!this.memoryStore) {
      throw new Error('resetStoreForTests is only available for the in-memory store');
    }
    this.memoryStore.clear();
  }

  private async consumeRedis(clientId: string): Promise<RateLimitConsumeResult> {
    const outcome: AsyncConsumeOutcome = await this.asyncLimiter!.consume(clientId);
    if (outcome.type === 'ok') {
      this.record(outcome.decision);
    }
    return outcome;
  }

  private record(decision: Decision): void {
    if (decision.allowed) {
      this.metrics.recordAllow(decision);
    } else {
      this.metrics.recordReject(decision);
    }
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
  {
    provide: RATE_LIMIT_STORE_KIND,
    useFactory: loadRateLimitStoreKindFromEnv,
  },
  {
    provide: RATE_LIMIT_ON_REDIS_ERROR,
    useFactory: loadRedisFailureModeFromEnv,
  },
  {
    provide: RATE_LIMIT_REDIS_OPTIONS,
    useFactory: loadRedisConnectionOptionsFromEnv,
  },
];
