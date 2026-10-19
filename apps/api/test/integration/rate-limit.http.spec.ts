import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { FakeClock } from '../../src/core/clock';
import {
  RATE_LIMIT_ALLOW_TEST_CLIENT_ID,
  RATE_LIMIT_POLICY,
  RATE_LIMIT_STORE_KIND,
} from '../../src/rate-limit/rate-limit.config';
import { TEST_CLIENT_ID_HEADER } from '../../src/rate-limit/nest-identity.extractor';
import {
  RATE_LIMIT_CLOCK,
  RateLimitService,
} from '../../src/rate-limit/rate-limit.service';

/** Aligned to a clean 60s calendar window for exact Reset / Retry-After math. */
const FAKE_NOW = 1_700_000_040_000;
const WINDOW_MS = 60_000;
const LIMIT = 3;
const RESET_AT = FAKE_NOW + WINDOW_MS;
const EXPECTED_RESET_SEC = String(Math.floor(RESET_AT / 1000));
const EXPECTED_RETRY_AFTER_SEC = String(
  Math.ceil((RESET_AT - FAKE_NOW) / 1000),
);

async function createApp(options: {
  allowTestClientId: boolean;
}): Promise<{ app: INestApplication; rateLimitService: RateLimitService }> {
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_TEST_CLIENT_ID = options.allowTestClientId
    ? 'true'
    : 'false';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RATE_LIMIT_STORE_KIND)
    .useValue('memory')
    .overrideProvider(RATE_LIMIT_POLICY)
    .useValue({ limit: LIMIT, windowMs: WINDOW_MS })
    .overrideProvider(RATE_LIMIT_ALLOW_TEST_CLIENT_ID)
    .useValue(options.allowTestClientId)
    .overrideProvider(RATE_LIMIT_CLOCK)
    .useValue(new FakeClock(FAKE_NOW))
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return { app, rateLimitService: app.get(RateLimitService) };
}

describe('HTTP rate limiting (override enabled)', () => {
  let app: INestApplication;
  let rateLimitService: RateLimitService;

  beforeAll(async () => {
    ({ app, rateLimitService } = await createApp({ allowTestClientId: true }));
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

    expect(res.headers['x-ratelimit-limit']).toBe(String(LIMIT));
    expect(res.headers['x-ratelimit-remaining']).toBe(String(LIMIT - 1));
    expect(res.headers['x-ratelimit-reset']).toBe(EXPECTED_RESET_SEC);
  });

  it('returns 429 with Retry-After when over the limit', async () => {
    const client = 'bob';
    for (let i = 0; i < LIMIT; i++) {
      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, client)
        .expect(200);
    }

    const rejected = await request(app.getHttpServer())
      .get('/api/demo')
      .set(TEST_CLIENT_ID_HEADER, client)
      .expect(429);

    expect(rejected.headers['x-ratelimit-limit']).toBe(String(LIMIT));
    expect(rejected.headers['x-ratelimit-remaining']).toBe('0');
    expect(rejected.headers['x-ratelimit-reset']).toBe(EXPECTED_RESET_SEC);
    expect(rejected.headers['retry-after']).toBe(EXPECTED_RETRY_AFTER_SEC);
  });

  it('isolates quotas by test client id when override is enabled', async () => {
    for (let i = 0; i < LIMIT; i++) {
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

describe('HTTP rate limiting (override disabled)', () => {
  let app: INestApplication;
  let rateLimitService: RateLimitService;

  beforeAll(async () => {
    ({ app, rateLimitService } = await createApp({ allowTestClientId: false }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    rateLimitService.resetStoreForTests();
  });

  it('ignores x-test-client-id and shares one quota when override is disabled', async () => {
    // Supertest hits the same Nest server from one local peer address, so all
    // requests share the effective IP identity when the test override is off.
    // If the override were accidentally enabled, the fourth distinct header
    // would still be allowed — that is the tripwire.
    for (const id of ['a', 'b', 'c']) {
      await request(app.getHttpServer())
        .get('/api/demo')
        .set(TEST_CLIENT_ID_HEADER, id)
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/api/demo')
      .set(TEST_CLIENT_ID_HEADER, 'd')
      .expect(429);
  });
});
