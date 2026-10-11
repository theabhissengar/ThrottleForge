import { Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import {
  ClientId,
  clientIdFromIp,
  clientIdFromTestOverride,
} from '../core/identity';
import { RATE_LIMIT_ALLOW_TEST_CLIENT_ID } from './rate-limit.config';

export const TEST_CLIENT_ID_HEADER = 'x-test-client-id';

@Injectable()
export class NestIdentityExtractor {
  constructor(
    @Inject(RATE_LIMIT_ALLOW_TEST_CLIENT_ID)
    private readonly allowTestClientId: boolean,
  ) {}

  extract(request: Request): ClientId {
    if (this.allowTestClientId) {
      const override = request.header(TEST_CLIENT_ID_HEADER);
      if (override && override.trim().length > 0) {
        return clientIdFromTestOverride(override.trim());
      }
    }

    // Do not trust X-Forwarded-For by default (no trusted-proxy setup in M1).
    const ip =
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown';

    return clientIdFromIp(ip);
  }
}
