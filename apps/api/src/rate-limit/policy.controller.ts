import { Controller, Get } from '@nestjs/common';
import { NestIdentityExtractor } from './nest-identity.extractor';
import { EnforcedHttpPolicy, RateLimitService } from './rate-limit.service';

export type HttpPolicySnapshot = EnforcedHttpPolicy & {
  testClientOverrideEnabled: boolean;
};

@Controller('api/rate-limit/policy')
export class RateLimitPolicyController {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly identityExtractor: NestIdentityExtractor,
  ) {}

  @Get()
  snapshot(): HttpPolicySnapshot {
    return {
      ...this.rateLimitService.httpPolicy(),
      testClientOverrideEnabled: this.identityExtractor.testClientOverrideEnabled(),
    };
  }
}
