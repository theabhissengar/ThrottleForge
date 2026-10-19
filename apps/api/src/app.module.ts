import { Module } from '@nestjs/common';
import { DemoController } from './demo/demo.controller';
import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [RateLimitModule],
  controllers: [HealthController, DemoController, MetricsController],
})
export class AppModule {}
