import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { RedisEvalClient } from '../../src/core/fixed-window.redis-store';
import {
  RATE_LIMIT_ALLOW_TEST_CLIENT_ID,
  RATE_LIMIT_EVAL_CLIENT,
  RATE_LIMIT_ON_REDIS_ERROR,
  RATE_LIMIT_POLICY,
  RATE_LIMIT_REDIS_OPTIONS,
  RATE_LIMIT_STORE_KIND,
} from '../../src/rate-limit/rate-limit.config';
import { TEST_CLIENT_ID_HEADER } from '../../src/rate-limit/nest-identity.extractor';

class ThrowingEval implements RedisEvalClient {
  calls = 0;

  constructor(private readonly error: Error) {}

  async eval(): Promise<unknown> {
    this.calls += 1;
    throw this.error;
  }
}

const REDIS_OPTIONS = {
  url: 'redis://127.0.0.1:6379',
  prefix: 'tf:fw:failure',
  connectTimeoutMs: 200,
  commandTimeoutMs: 200,
};

async function createApp(
  mode: 'open' | 'closed',
  client: ThrowingEval,
): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RATE_LIMIT_STORE_KIND)
    .useValue('redis')
    .overrideProvider(RATE_LIMIT_ON_REDIS_ERROR)
    .useValue(mode)
    .overrideProvider(RATE_LIMIT_POLICY)
    .useValue({ limit: 3, windowMs: 60_000 })
    .overrideProvider(RATE_LIMIT_ALLOW_TEST_CLIENT_ID)
    .useValue(true)
    .overrideProvider(RATE_LIMIT_REDIS_OPTIONS)
    .useValue(REDIS_OPTIONS)
    .overrideProvider(RATE_LIMIT_EVAL_CLIENT)
    .useValue(client)
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

function expectNoQuotaHeaders(headers: Record<string, string>): void {
  expect(headers['x-ratelimit-limit']).toBeUndefined();
  expect(headers['x-ratelimit-remaining']).toBeUndefined();
  expect(headers['x-ratelimit-reset']).toBeUndefined();
  expect(headers['retry-after']).toBeUndefined();
}

function metricValue(body: string, metric: string): number | undefined {
  const line = body.split('\n').find((entry) => entry.startsWith(`${metric}{`));
  if (!line) {
    return undefined;
  }
  return Number(line.trim().split(/\s+/).pop());
}

describe('Redis failure HTTP contract', () => {
  describe('fail-closed', () => {
    it.each([
      ['connection error', new Error('Connection is closed')],
      ['command timeout', new Error('Command timed out')],
    ])('returns 503 for a %s', async (_label, error) => {
      const client = new ThrowingEval(error);
      const app = await createApp('closed', client);
      try {
        const res = await request(app.getHttpServer())
          .get('/api/demo')
          .set(TEST_CLIENT_ID_HEADER, 'alice')
          .expect(503);

        expect(res.body).toEqual({
          statusCode: 503,
          message: 'Rate limit store unavailable',
        });
        expectNoQuotaHeaders(res.headers);
        expect(res.headers['x-ratelimit-mode']).toBeUndefined();
        expect(client.calls).toBe(1);

        const metrics = await request(app.getHttpServer()).get('/metrics').expect(200);
        expect(
          metricValue(metrics.text, 'throttleforge_rate_limit_store_failures_total'),
        ).toBe(1);
        expect(metrics.text).toContain('store="redis"');
        expect(metrics.text).toContain('algorithm="fixed_window"');
        expect(metrics.text).not.toMatch(
          /^throttleforge_rate_limit_degraded_requests_total\{/m,
        );
        expect(metrics.text).not.toMatch(/^throttleforge_rate_limit_requests_total\{/m);
        expect(metrics.text).toContain(
          'throttleforge_rate_limit_operation_duration_seconds_count{algorithm="fixed_window",result="unavailable",store="redis"} 1',
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('fail-open', () => {
    it.each([
      ['connection error', new Error('Connection is closed')],
      ['command timeout', new Error('Command timed out')],
    ])('returns a degraded 200 for a %s', async (_label, error) => {
      const client = new ThrowingEval(error);
      const app = await createApp('open', client);
      try {
        const res = await request(app.getHttpServer())
          .get('/api/demo')
          .set(TEST_CLIENT_ID_HEADER, 'alice')
          .expect(200);

        expect(res.body).toEqual({ message: 'ok' });
        expect(res.headers['x-ratelimit-mode']).toBe('degraded');
        expectNoQuotaHeaders(res.headers);
        expect(client.calls).toBe(1);

        const metrics = await request(app.getHttpServer()).get('/metrics').expect(200);
        expect(
          metricValue(metrics.text, 'throttleforge_rate_limit_store_failures_total'),
        ).toBe(1);
        expect(
          metricValue(metrics.text, 'throttleforge_rate_limit_degraded_requests_total'),
        ).toBe(1);
        expect(metrics.text).not.toMatch(/^throttleforge_rate_limit_requests_total\{/m);
        expect(metrics.text).toContain(
          'throttleforge_rate_limit_operation_duration_seconds_count{algorithm="fixed_window",result="unavailable",store="redis"} 1',
        );
      } finally {
        await app.close();
      }
    });
  });
});
