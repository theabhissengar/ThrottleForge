import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Decision } from '../core/decision';
import { NestIdentityExtractor } from './nest-identity.extractor';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly identityExtractor: NestIdentityExtractor,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const clientId = this.identityExtractor.extract(request);
    const decision = this.rateLimitService.consume(clientId);

    this.applyRateLimitHeaders(response, decision);

    if (!decision.allowed) {
      const retryAfter = decision.retryAfterSec ?? 0;
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          retryAfterSec: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private applyRateLimitHeaders(
    response: Response,
    decision: Decision,
  ): void {
    response.setHeader('X-RateLimit-Limit', String(decision.limit));
    response.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    // Reset as Unix epoch seconds (common convention for this header).
    response.setHeader(
      'X-RateLimit-Reset',
      String(Math.floor(decision.resetAt / 1000)),
    );
  }
}
