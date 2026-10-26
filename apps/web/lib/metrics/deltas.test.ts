import { describe, expect, it } from 'vitest'
import { presenceNote } from './format'
import {
  advanceSeries,
  applyReadings,
  deriveFreshness,
  EMPTY_HELD,
  outcomeIntervalPoint,
  outcomeYDomain,
  POLL_INTERVAL_MS,
  STALE_AFTER_MS,
  stepCumulative,
  type HeldCounters,
} from './deltas'

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

const reported = (value: number) => ({ value, presence: 'reported' as const })
const absent = { value: 0, presence: 'absent' as const }

describe('advanceSeries', () => {
  it('produces a zero delta when a reported counter is unchanged', () => {
    expect(advanceSeries(4, reported(4))).toEqual({ kind: 'delta', held: 4, delta: 0 })
  })

  it('does not turn an absent sample into a zero delta or a reset', () => {
    expect(advanceSeries(4, absent)).toEqual({ kind: 'absent', held: 4 })
  })

  it('keeps the last reported value across a missing sample and deltas the next report', () => {
    const baseline = advanceSeries(null, reported(5))
    expect(baseline).toEqual({ kind: 'baseline', held: 5 })
    const gap = advanceSeries(baseline.held, absent)
    expect(gap).toEqual({ kind: 'absent', held: 5 })
    expect(advanceSeries(gap.held, reported(8))).toEqual({ kind: 'delta', held: 8, delta: 3 })
  })

  it('resets only when a reported value decreases, then deltas from the new value', () => {
    const reset = advanceSeries(10, reported(2))
    expect(reset).toEqual({ kind: 'reset', held: 2 })
    expect(advanceSeries(reset.held, reported(4))).toEqual({ kind: 'delta', held: 4, delta: 2 })
  })

  it('treats the first reported value, including zero, as a baseline', () => {
    expect(advanceSeries(null, reported(0))).toEqual({ kind: 'baseline', held: 0 })
  })
})

describe('outcomeIntervalPoint', () => {
  it('plots a reported allowed interval and leaves an absent rejected series null', () => {
    expect(outcomeIntervalPoint(advanceSeries(5, reported(8)), advanceSeries(1, absent))).toEqual({
      allowed: 3,
      rejected: null,
    })
  })

  it('plots a reported rejected interval and leaves an absent allowed series null', () => {
    expect(outcomeIntervalPoint(advanceSeries(5, absent), advanceSeries(1, reported(4)))).toEqual({
      allowed: null,
      rejected: 3,
    })
  })

  it('does not fabricate a point when both outcome series are absent', () => {
    expect(outcomeIntervalPoint(advanceSeries(5, absent), advanceSeries(1, absent))).toBeNull()
  })

  it('does not fabricate a point from a baseline, including a reported zero', () => {
    expect(outcomeIntervalPoint(advanceSeries(null, reported(0)), advanceSeries(null, absent))).toBeNull()
  })

  it('keeps a legitimate zero delta', () => {
    expect(outcomeIntervalPoint(advanceSeries(2, reported(2)), advanceSeries(1, reported(1)))).toEqual({
      allowed: 0,
      rejected: 0,
    })
  })
})

describe('outcomeYDomain', () => {
  it('keeps a zero line visible without inventing a higher point', () => {
    expect(outcomeYDomain([{ allowed: 0, rejected: 0 }])).toEqual([0, 1])
    expect(outcomeYDomain([{ allowed: 0, rejected: null }])).toEqual([0, 1])
  })

  it('uses the data maximum when any plotted delta is nonzero', () => {
    expect(outcomeYDomain([{ allowed: 0, rejected: 2 }])).toEqual([0, 'dataMax'])
  })
})

describe('applyReadings', () => {
  it('does not store zero for an absent series when another series resets', () => {
    const held: HeldCounters = { allowed: 10, rejected: 4, failures: null, degraded: 1 }
    const applied = applyReadings(held, {
      allowed: reported(2),
      rejected: absent,
      failures: absent,
      degraded: reported(1),
    })
    expect(applied.reset).toBe(true)
    expect(applied.point).toBeNull()
    expect(applied.delta).toBeNull()
    expect(applied.scrape).toBe('reset')
    expect(applied.held).toEqual({ allowed: 2, rejected: 4, failures: null, degraded: 1 })
  })

  it('records a partial outcome interval without a zero for the missing series', () => {
    const applied = applyReadings(
      { ...EMPTY_HELD, allowed: 5, rejected: 1 },
      {
        allowed: reported(5),
        rejected: absent,
        failures: absent,
        degraded: reported(0),
      },
    )
    expect(applied.reset).toBe(false)
    expect(applied.point).toEqual({ allowed: 0, rejected: null })
    expect(applied.delta).toEqual({ allowed: 0, rejected: null, failures: null, degraded: null })
    expect(applied.held.rejected).toBe(1)
  })
})

describe('presenceNote', () => {
  it('does not describe an absent sample as zero', () => {
    expect(presenceNote('absent', 0)).toBe('No sample in this scrape')
    expect(presenceNote('reported', 0)).toBe('Reported 0')
  })
})
