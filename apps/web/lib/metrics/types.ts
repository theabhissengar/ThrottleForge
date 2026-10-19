export type SamplePresence = 'reported' | 'absent'

export type CountReading = {
  value: number
  presence: SamplePresence
}

export type HistogramBucket = {
  le: string
  cumulative: number
  openEnded: boolean
}

export type MetricsSnapshot = {
  allowed: CountReading
  rejected: CountReading
  failures: CountReading
  degraded: CountReading
  store: string | null
  algorithm: string | null
  histogram: {
    count: CountReading
    sum: number | null
    meanSeconds: number | null
    buckets: HistogramBucket[]
  }
}

export type ParseResult =
  | { ok: true; snapshot: MetricsSnapshot }
  | { ok: false; error: string }

export type LivePayload = {
  fetchedAt: string
  health: {
    state: 'reachable' | 'unreachable'
    status?: string
    error?: string
  }
  metrics: {
    state: 'ok' | 'error'
    error?: string
    snapshot?: MetricsSnapshot
  }
}
