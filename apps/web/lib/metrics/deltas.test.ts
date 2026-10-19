import { describe, expect, it } from 'vitest'
import { deriveFreshness, POLL_INTERVAL_MS, STALE_AFTER_MS, stepCumulative } from './deltas'

const base = { allowed: 2, rejected: 1, failures: 0, degraded: 0 }

describe('stepCumulative', () => {
  it('treats the first scrape as a baseline', () => {
    expect(stepCumulative(null, base).kind).toBe('baseline')
  })

  it('subtracts increasing counters', () => {
    const step = stepCumulative(base, { allowed: 5, rejected: 1, failures: 1, degraded: 0 })
    expect(step).toEqual({
      kind: 'delta',
      cumulative: { allowed: 5, rejected: 1, failures: 1, degraded: 0 },
      delta: { allowed: 3, rejected: 0, failures: 1, degraded: 0 },
    })
  })

  it('starts a new segment when a counter decreases', () => {
    const step = stepCumulative(base, { allowed: 0, rejected: 0, failures: 0, degraded: 0 })
    expect(step.kind).toBe('reset')
  })
})

describe('deriveFreshness', () => {
  it('stays collecting until the first attempt finishes', () => {
    expect(
      deriveFreshness({
        attempted: false,
        hasSnapshot: false,
        metricsError: false,
        lastSuccessAt: null,
        now: 0,
      }),
    ).toBe('collecting')
  })

  it('is unreachable when the attempt produced no snapshot', () => {
    expect(
      deriveFreshness({
        attempted: true,
        hasSnapshot: false,
        metricsError: true,
        lastSuccessAt: null,
        now: 5_000,
      }),
    ).toBe('unreachable')
  })

  it('is stale after two poll intervals', () => {
    expect(STALE_AFTER_MS).toBe(POLL_INTERVAL_MS * 2)
    expect(
      deriveFreshness({
        attempted: true,
        hasSnapshot: true,
        metricsError: false,
        lastSuccessAt: 0,
        now: STALE_AFTER_MS + 1,
      }),
    ).toBe('stale')
  })
})
