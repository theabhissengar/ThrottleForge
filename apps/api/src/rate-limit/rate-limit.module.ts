import { Module } from '@nestjs/common';
import {
  loadAllowTestClientIdFromEnv,
  RATE_LIMIT_ALLOW_TEST_CLIENT_ID,
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
