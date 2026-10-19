import { Controller, Get, Header, Inject } from '@nestjs/common';
import { RATE_LIMIT_METRICS } from '../rate-limit/rate-limit.service';
import { RateLimitMetrics } from './metrics.interface';

@Controller()
export class MetricsController {
  constructor(
    @Inject(RATE_LIMIT_METRICS) private readonly metrics: RateLimitMetrics,
  ) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): string {
    return this.metrics.render();
  }
}
