import { describe, expect, it } from 'vitest'
import { parsePolicy, parsePolicyText, readPolicyPayload } from './policy'

const snapshot = {
  algorithm: 'fixed_window',
  limit: 7,
  windowMs: 1500,
  store: 'redis',
  redisErrorPolicy: 'open',
  testClientOverrideEnabled: false,
}

describe('parsePolicy', () => {
  it('accepts the enforced snapshot and ignores extra fields', () => {
    expect(parsePolicy({ ...snapshot, redisUrl: 'redis://secret' })).toEqual({
      state: 'ok',
      policy: snapshot,
    })
  })

  it('does not invent a limit when a field is missing', () => {
    const rest: Record<string, unknown> = { ...snapshot }
    delete rest.limit
    expect(parsePolicy(rest)).toEqual({ state: 'unavailable' })
    expect(parsePolicy({ ...snapshot, algorithm: 'sliding_window' })).toEqual({ state: 'unavailable' })
    expect(parsePolicy({ ...snapshot, limit: 5.5 })).toEqual({ state: 'unavailable' })
    expect(parsePolicyText('not-json')).toEqual({ state: 'unavailable' })
    expect(parsePolicyText('<!DOCTYPE html><html><body>Waking service</body></html>')).toEqual({
      state: 'unavailable',
    })
    expect(readPolicyPayload({ state: 'ok' })).toEqual({ state: 'unavailable' })
    expect(readPolicyPayload({ state: 'unavailable' })).toEqual({ state: 'unavailable' })
  })
})
