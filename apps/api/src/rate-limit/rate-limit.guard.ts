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
import {
  RateLimitConsumeResult,
  RateLimitService,
} from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly identityExtractor: NestIdentityExtractor,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const clientId = this.identityExtractor.extract(request);
    const result = this.rateLimitService.consume(clientId);
    if (result instanceof Promise) {
      return result.then((outcome) => this.finish(response, outcome));
    }
    return this.finish(response, result);
  }

  private finish(response: Response, outcome: RateLimitConsumeResult): boolean {
    if (outcome.type === 'unavailable') {
      return this.finishUnavailable(response);
    }

    const decision = outcome.decision;
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

  private finishUnavailable(response: Response): boolean {
    if (this.rateLimitService.redisErrorMode() === 'open') {
      response.setHeader('X-RateLimit-Mode', 'degraded');
      return true;
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Rate limit store unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
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
