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
const SECRET_URL = 'redis://secret-user:secret-pass@127.0.0.1:6379/9';
const SECRET_PREFIX = 'tf:secret-prefix';
const SECRET_ERROR = 'injected-redis-error-sentinel';

class IdleEval implements RedisEvalClient {
  async eval(): Promise<unknown> {
    throw new Error(SECRET_ERROR);
  }
}

describe('GET /api/rate-limit/policy', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports the injected limiter configuration, not a second env read', async () => {
    process.env.RATE_LIMIT = '99';
    process.env.RATE_WINDOW_MS = '9999';
    process.env.RATE_LIMIT_STORE = 'memory';
    process.env.RATE_LIMIT_ON_REDIS_ERROR = 'closed';
    process.env.ALLOW_TEST_CLIENT_ID = 'false';
    process.env.NODE_ENV = 'test';

    const app = await createApp({
      policy: { limit: 7, windowMs: 1500 },
      store: 'redis',
      redisErrorPolicy: 'open',
      allowTestClientId: true,
      redisUrl: SECRET_URL,
    });
    try {
      const res = await request(app.getHttpServer())
        .get('/api/rate-limit/policy')
        .expect(200);

      expect(res.body).toEqual({
        algorithm: 'fixed_window',
        limit: 7,
        windowMs: 1500,
        store: 'redis',
        redisErrorPolicy: 'open',
        testClientOverrideEnabled: true,
      });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(SECRET_URL);
      expect(serialized).not.toContain(SECRET_PREFIX);
      expect(serialized).not.toContain(SECRET_ERROR);
      expect(serialized).not.toContain('secret-pass');
    } finally {
      await app.close();
    }
  });

  it('reports the real test-client factory as disabled in production', async () => {
    process.env.ALLOW_TEST_CLIENT_ID = 'true';
    process.env.NODE_ENV = 'production';
    process.env.RATE_LIMIT_STORE = 'memory';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMIT_STORE_KIND)
      .useValue('memory')
      .overrideProvider(RATE_LIMIT_POLICY)
      .useValue({ limit: 4, windowMs: 1000 })
      .compile();
    const app = moduleFixture.createNestApplication();
    await app.init();
    try {
      const res = await request(app.getHttpServer())
        .get('/api/rate-limit/policy')
        .expect(200);
      expect(res.body.testClientOverrideEnabled).toBe(false);
      expect(res.body.algorithm).toBe('fixed_window');
      expect(res.body.limit).toBe(4);
      expect(res.body.windowMs).toBe(1000);
      expect(res.body.store).toBe('memory');
    } finally {
      await app.close();
    }
  });

  it('rejects writes and does not consume demo quota', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_CLIENT_ID = 'false';
    const app = await createApp({
      policy: { limit: 3, windowMs: 60_000 },
      store: 'memory',
      redisErrorPolicy: 'closed',
      allowTestClientId: false,
      redisUrl: SECRET_URL,
    });
    try {
      await request(app.getHttpServer())
        .post('/api/rate-limit/policy')
        .expect(404);

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get('/api/rate-limit/policy')
          .expect(200);
      }

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get('/api/demo').expect(200);
      }
      await request(app.getHttpServer()).get('/api/demo').expect(429);
    } finally {
      await app.close();
    }
  });
});

async function createApp(options: {
  policy: { limit: number; windowMs: number };
  store: 'memory' | 'redis';
  redisErrorPolicy: 'open' | 'closed';
  allowTestClientId: boolean;
  redisUrl: string;
}): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RATE_LIMIT_POLICY)
    .useValue(options.policy)
    .overrideProvider(RATE_LIMIT_STORE_KIND)
    .useValue(options.store)
    .overrideProvider(RATE_LIMIT_ON_REDIS_ERROR)
    .useValue(options.redisErrorPolicy)
    .overrideProvider(RATE_LIMIT_ALLOW_TEST_CLIENT_ID)
    .useValue(options.allowTestClientId)
    .overrideProvider(RATE_LIMIT_REDIS_OPTIONS)
    .useValue({
      url: options.redisUrl,
      prefix: SECRET_PREFIX,
      connectTimeoutMs: 200,
      commandTimeoutMs: 200,
    })
    .overrideProvider(RATE_LIMIT_EVAL_CLIENT)
    .useValue(options.store === 'redis' ? new IdleEval() : null)
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}
