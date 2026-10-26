import type { CountReading } from './types'

export const STALE_AFTER_MS = 10_000
export const POLL_INTERVAL_MS = 5_000

export type Cumulative = {
  allowed: number
  rejected: number
  failures: number
  degraded: number
}

export type DeltaStep =
  | { kind: 'baseline'; cumulative: Cumulative }
  | { kind: 'delta'; cumulative: Cumulative; delta: Cumulative }
  | { kind: 'reset'; cumulative: Cumulative }

export type Freshness = 'collecting' | 'live' | 'stale' | 'unreachable'

export function stepCumulative(previous: Cumulative | null, next: Cumulative): DeltaStep {
  if (!previous) return { kind: 'baseline', cumulative: next }
  if (
    next.allowed < previous.allowed ||
    next.rejected < previous.rejected ||
    next.failures < previous.failures ||
    next.degraded < previous.degraded
  ) {
    return { kind: 'reset', cumulative: next }
  }
  return {
    kind: 'delta',
    cumulative: next,
    delta: {
      allowed: next.allowed - previous.allowed,
      rejected: next.rejected - previous.rejected,
      failures: next.failures - previous.failures,
      degraded: next.degraded - previous.degraded,
    },
  }
}

export function deriveFreshness(input: {
  attempted: boolean
  hasSnapshot: boolean
  metricsError: boolean
  lastSuccessAt: number | null
  now: number
}): Freshness {
  if (!input.attempted) return 'collecting'
  if (!input.hasSnapshot || input.lastSuccessAt === null) return 'unreachable'
  if (input.metricsError || input.now - input.lastSuccessAt > STALE_AFTER_MS) return 'stale'
  return 'live'
}

export type SeriesInterval =
  | { kind: 'absent'; held: number | null }
  | { kind: 'baseline'; held: number }
  | { kind: 'delta'; held: number; delta: number }
  | { kind: 'reset'; held: number }

/** Presence-aware step for one counter. Absent samples do not become zero or a reset. */
export function advanceSeries(held: number | null, reading: CountReading): SeriesInterval {
  if (reading.presence === 'absent') return { kind: 'absent', held }
  if (held === null) return { kind: 'baseline', held: reading.value }
  if (reading.value < held) return { kind: 'reset', held: reading.value }
  return { kind: 'delta', held: reading.value, delta: reading.value - held }
}

export type OutcomePoint = {
  allowed: number | null
  rejected: number | null
}

/** Uses [0, 1] only so a real all-zero interval stays visible. No extra points are added. */
export function outcomeYDomain(points: readonly OutcomePoint[]): [0, 1] | [0, 'dataMax'] {
  const numbers: number[] = []
  for (const point of points) {
    if (point.allowed !== null) numbers.push(point.allowed)
    if (point.rejected !== null) numbers.push(point.rejected)
  }
  if (numbers.length > 0 && numbers.every((value) => value === 0)) return [0, 1]
  return [0, 'dataMax']
}

/** A point exists only when at least one outcome series has a real interval. The other stays null. */
export function outcomeIntervalPoint(allowed: SeriesInterval, rejected: SeriesInterval): OutcomePoint | null {
  if (allowed.kind !== 'delta' && rejected.kind !== 'delta') return null
  return {
    allowed: allowed.kind === 'delta' ? allowed.delta : null,
    rejected: rejected.kind === 'delta' ? rejected.delta : null,
  }
}

export type SeriesName = 'allowed' | 'rejected' | 'failures' | 'degraded'

export type HeldCounters = Record<SeriesName, number | null>

export type IntervalDelta = Record<SeriesName, number | null>

export type ScrapeKind = 'baseline' | 'delta' | 'reset'

export const EMPTY_HELD: HeldCounters = {
  allowed: null,
  rejected: null,
  failures: null,
  degraded: null,
}

const SERIES_NAMES: readonly SeriesName[] = ['allowed', 'rejected', 'failures', 'degraded']

export type AppliedReadings = {
  held: HeldCounters
  scrape: ScrapeKind
  delta: IntervalDelta | null
  reset: boolean
  point: OutcomePoint | null
}

/** Applies one scrape to held counters without feeding absent zeros into stepCumulative. */
export function applyReadings(held: HeldCounters, readings: Record<SeriesName, CountReading>): AppliedReadings {
  const steps = {
    allowed: advanceSeries(held.allowed, readings.allowed),
    rejected: advanceSeries(held.rejected, readings.rejected),
    failures: advanceSeries(held.failures, readings.failures),
    degraded: advanceSeries(held.degraded, readings.degraded),
  }
  const nextHeld: HeldCounters = {
    allowed: steps.allowed.held,
    rejected: steps.rejected.held,
    failures: steps.failures.held,
    degraded: steps.degraded.held,
  }
  if (SERIES_NAMES.some((name) => steps[name].kind === 'reset')) {
    return { held: nextHeld, scrape: 'reset', delta: null, reset: true, point: null }
  }
  const anyDelta = SERIES_NAMES.some((name) => steps[name].kind === 'delta')
  const omittedAfterReport = SERIES_NAMES.some((name) => steps[name].kind === 'absent' && held[name] !== null)
  if (!anyDelta && !omittedAfterReport) {
    return { held: nextHeld, scrape: 'baseline', delta: null, reset: false, point: null }
  }
  return {
    held: nextHeld,
    scrape: 'delta',
    delta: {
      allowed: steps.allowed.kind === 'delta' ? steps.allowed.delta : null,
      rejected: steps.rejected.kind === 'delta' ? steps.rejected.delta : null,
      failures: steps.failures.kind === 'delta' ? steps.failures.delta : null,
      degraded: steps.degraded.kind === 'delta' ? steps.degraded.delta : null,
    },
    reset: false,
    point: outcomeIntervalPoint(steps.allowed, steps.rejected),
  }
}
