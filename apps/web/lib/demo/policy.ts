export type PolicySnapshot = {
  algorithm: 'fixed_window'
  limit: number
  windowMs: number
  store: 'memory' | 'redis'
  redisErrorPolicy: 'open' | 'closed'
  testClientOverrideEnabled: boolean
}

export type PolicyRead =
  | { state: 'ok'; policy: PolicySnapshot }
  | { state: 'unavailable' }

const REQUIRED = [
  'algorithm',
  'limit',
  'windowMs',
  'store',
  'redisErrorPolicy',
  'testClientOverrideEnabled',
] as const

export function parsePolicy(value: unknown): PolicyRead {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { state: 'unavailable' }
  }
  const record = value as Record<string, unknown>
  for (const key of REQUIRED) {
    if (!(key in record)) return { state: 'unavailable' }
  }
  if (record.algorithm !== 'fixed_window') return { state: 'unavailable' }
  if (!positiveInteger(record.limit) || !positiveInteger(record.windowMs)) {
    return { state: 'unavailable' }
  }
  if (record.store !== 'memory' && record.store !== 'redis') return { state: 'unavailable' }
  if (record.redisErrorPolicy !== 'open' && record.redisErrorPolicy !== 'closed') {
    return { state: 'unavailable' }
  }
  if (typeof record.testClientOverrideEnabled !== 'boolean') return { state: 'unavailable' }
  return {
    state: 'ok',
    policy: {
      algorithm: 'fixed_window',
      limit: record.limit,
      windowMs: record.windowMs,
      store: record.store,
      redisErrorPolicy: record.redisErrorPolicy,
      testClientOverrideEnabled: record.testClientOverrideEnabled,
    },
  }
}

export function parsePolicyText(text: string): PolicyRead {
  try {
    return parsePolicy(JSON.parse(text) as unknown)
  } catch {
    return { state: 'unavailable' }
  }
}

export function redisFailureLabel(policy: PolicySnapshot): string {
  const mode = policy.redisErrorPolicy === 'open' ? 'fail-open' : 'fail-closed'
  if (policy.store === 'memory') return `${mode}. Applies when the store is Redis.`
  return mode
}

export function readPolicyPayload(body: unknown): PolicyRead {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { state: 'unavailable' }
  const record = body as { state?: unknown; policy?: unknown }
  if (record.state === 'unavailable') return { state: 'unavailable' }
  if (record.state === 'ok') return parsePolicy(record.policy)
  return { state: 'unavailable' }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}
