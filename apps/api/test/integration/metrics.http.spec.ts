import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { FakeClock } from '../../src/core/clock';
import { MetricObservation, RateLimitMetrics } from '../../src/metrics/metrics.interface';
import {
  RATE_LIMIT_ALLOW_TEST_CLIENT_ID,
  RATE_LIMIT_POLICY,
  RATE_LIMIT_STORE_KIND,
} from '../../src/rate-limit/rate-limit.config';
import { TEST_CLIENT_ID_HEADER } from '../../src/rate-limit/nest-identity.extractor';
import {
  RATE_LIMIT_CLOCK,
  RATE_LIMIT_METRICS,
} from '../../src/rate-limit/rate-limit.service';

const CLIENT_ID = 'zz-metrics-subject';

class ThrowingMetrics implements RateLimitMetrics {
  recordAllow(_observation: MetricObservation): void {
    throw new Error('metrics allow failed');
  }
  recordReject(_observation: MetricObservation): void {
    throw new Error('metrics reject failed');
  }
  recordStoreFailure(_observation: MetricObservation): void {
    throw new Error('metrics failure failed');
  }
  recordDegraded(_observation: MetricObservation): void {
    throw new Error('metrics degraded failed');
  }
  render(): string {
    throw new Error('metrics render failed');
  }
}

async function createApp(input: {
  limit: number;
  metrics?: RateLimitMetrics;
}): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RATE_LIMIT_STORE_KIND)
    .useValue('memory')
    .overrideProvider(RATE_LIMIT_POLICY)
    .useValue({ limit: input.limit, windowMs: 60_000 })
    .overrideProvider(RATE_LIMIT_ALLOW_TEST_CLIENT_ID)
    .useValue(true)
    .overrideProvider(RATE_LIMIT_CLOCK)
    .useValue(new FakeClock(1_700_000_040_000));

  if (input.metrics) {
    builder = builder.overrideProvider(RATE_LIMIT_METRICS).useValue(input.metrics);
  }

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

function counter(body: string, metric: string, result: string): number {
  const line = body
    .split('\n')
    .find(
      (entry) =>
        entry.startsWith(`${metric}{`) &&
        entry.includes(`result="${result}"`) &&
        entry.includes('store="memory"') &&
        entry.includes('algorithm="fixed_window"'),
    );
  if (!line) {
    return 0;
  }
  return Number(line.trim().split(/\s+/).pop());
}

describe('GET /metrics', () => {
  it('scrapes prometheus text without consuming quota or labeling the client', async () => {
    const app = await createApp({ limit: 2 });
    try {
      const idle = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(idle.headers['content-type']).toContain('text/plain');
      expect(idle.headers['content-type']).toContain('version=0.0.4');
      expect(idle.text).toContain('# HELP throttleforge_rate_limit_requests_total ');
      expect(idle.text).toContain('# TYPE throttleforge_rate_limit_requests_total counter');
      expect(idle.text).toContain(
        '# TYPE throttleforge_rate_limit_operation_duration_seconds histogram',
      );
      expect(idle.text).not.toMatch(/^throttleforge_rate_limit_requests_total\{/m);

      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, CLIENT_ID)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, CLIENT_ID)
        .expect(200);
      const rejected = await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, CLIENT_ID)
        .expect(429);
      expect(rejected.headers['x-ratelimit-remaining']).toBe('0');

      const scraped = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(counter(scraped.text, 'throttleforge_rate_limit_requests_total', 'allowed')).toBe(2);
      expect(counter(scraped.text, 'throttleforge_rate_limit_requests_total', 'rejected')).toBe(1);
      expect(scraped.text).toContain('store="memory"');
      expect(scraped.text).toContain('algorithm="fixed_window"');
      expect(scraped.text).not.toContain(CLIENT_ID);
      expect(scraped.text).not.toContain('client=');
      expect(scraped.text).not.toContain('ip=');
      expect(scraped.text).not.toContain('path=');

      const again = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(again.text).toBe(scraped.text);
    } finally {
      await app.close();
    }
  });

  it('keeps allow and reject HTTP results when metrics throw', async () => {
    const app = await createApp({ limit: 1, metrics: new ThrowingMetrics() });
    try {
      const allowed = await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, CLIENT_ID)
        .expect(200);
      expect(allowed.headers['x-ratelimit-limit']).toBe('1');
      expect(allowed.headers['x-ratelimit-remaining']).toBe('0');
      expect(allowed.headers['x-ratelimit-reset']).toBeDefined();

      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, CLIENT_ID)
        .expect(429);

      const scrape = await request(app.getHttpServer()).get('/metrics');
      expect(scrape.status).not.toBe(200);

      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, CLIENT_ID)
        .expect(429);
    } finally {
      await app.close();
    }
  });
});
