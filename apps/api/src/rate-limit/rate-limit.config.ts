import { FixedWindowPolicy } from '../core/policy';

export const RATE_LIMIT_POLICY = 'RATE_LIMIT_POLICY';
export const RATE_LIMIT_ALLOW_TEST_CLIENT_ID =
  'RATE_LIMIT_ALLOW_TEST_CLIENT_ID';

export function loadFixedWindowPolicyFromEnv(): FixedWindowPolicy {
  const limit = Number.parseInt(process.env.RATE_LIMIT ?? '5', 10);
  const windowMs = Number.parseInt(process.env.RATE_WINDOW_MS ?? '60000', 10);
  return { limit, windowMs };
}

/**
 * Test identity override is allowed only when explicitly enabled and the
 * process is in test or development mode. Production must leave this off.
 */
export function loadAllowTestClientIdFromEnv(): boolean {
  const flag = process.env.ALLOW_TEST_CLIENT_ID === 'true';
  const env = process.env.NODE_ENV ?? 'development';
  return flag && (env === 'test' || env === 'development');
}
