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
