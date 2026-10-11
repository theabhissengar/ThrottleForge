import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  RATE_LIMIT_ALLOW_TEST_CLIENT_ID,
  RATE_LIMIT_POLICY,
} from '../../src/rate-limit/rate-limit.config';
import { TEST_CLIENT_ID_HEADER } from '../../src/rate-limit/nest-identity.extractor';
import { RateLimitService } from '../../src/rate-limit/rate-limit.service';

describe('HTTP rate limiting (integration)', () => {
  let app: INestApplication;
  let rateLimitService: RateLimitService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_CLIENT_ID = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMIT_POLICY)
      .useValue({ limit: 3, windowMs: 60_000 })
      .overrideProvider(RATE_LIMIT_ALLOW_TEST_CLIENT_ID)
      .useValue(true)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    rateLimitService = app.get(RateLimitService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    rateLimitService.resetStoreForTests();
  });

  it('allows health without rate limiting', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('allows under the limit and returns rate-limit headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/demo')
      .set(TEST_CLIENT_ID_HEADER, 'alice')
      .expect(200);

    expect(res.headers['x-ratelimit-limit']).toBe('3');
    expect(res.headers['x-ratelimit-remaining']).toBe('2');
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('returns 429 with Retry-After when over the limit', async () => {
    const client = 'bob';
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, client)
        .expect(200);
    }

    const rejected = await request(app.getHttpServer())
      .get('/api/demo')
      .set(TEST_CLIENT_ID_HEADER, client)
      .expect(429);

    expect(rejected.headers['retry-after']).toBeDefined();
    expect(Number.parseInt(rejected.headers['retry-after'], 10)).toBeGreaterThanOrEqual(
      0,
    );
    expect(rejected.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('isolates quotas by test client id when override is enabled', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, 'exhausted')
        .expect(200);
    }
    await request(app.getHttpServer())
      .get('/api/demo')
      .set(TEST_CLIENT_ID_HEADER, 'exhausted')
      .expect(429);

    await request(app.getHttpServer())
      .get('/api/demo')
      .set(TEST_CLIENT_ID_HEADER, 'other')
      .expect(200);
  });
});
