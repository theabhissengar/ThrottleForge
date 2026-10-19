import { Module } from '@nestjs/common';
import {
  createIoredisEvalClient,
  RedisConnectionOptions,
} from './ioredis.client';
import {
  loadAllowTestClientIdFromEnv,
  RATE_LIMIT_ALLOW_TEST_CLIENT_ID,
  RATE_LIMIT_EVAL_CLIENT,
  RATE_LIMIT_REDIS_OPTIONS,
  RATE_LIMIT_STORE_KIND,
  RateLimitStoreKind,
} from './rate-limit.config';
import { NestIdentityExtractor } from './nest-identity.extractor';
import { RateLimitGuard } from './rate-limit.guard';
import {
  defaultRateLimitProviders,
  RateLimitService,
} from './rate-limit.service';

@Module({
  providers: [
    ...defaultRateLimitProviders,
    {
      provide: RATE_LIMIT_EVAL_CLIENT,
      useFactory: (
        kind: RateLimitStoreKind,
        options: RedisConnectionOptions | null,
      ) => {
        if (kind !== 'redis') {
          return null;
        }
        if (!options) {
          throw new Error('Redis options are required when RATE_LIMIT_STORE=redis');
        }
        return createIoredisEvalClient(options);
      },
      inject: [RATE_LIMIT_STORE_KIND, RATE_LIMIT_REDIS_OPTIONS],
    },
    {
      provide: RATE_LIMIT_ALLOW_TEST_CLIENT_ID,
      useFactory: loadAllowTestClientIdFromEnv,
    },
    NestIdentityExtractor,
    RateLimitService,
    RateLimitGuard,
  ],
  exports: [RateLimitService, RateLimitGuard, NestIdentityExtractor],
})
export class RateLimitModule {}
