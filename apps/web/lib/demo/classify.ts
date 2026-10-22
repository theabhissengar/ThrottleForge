import { DEMO_HEADER_CAP } from './constants'

export type ProbeOutcome =
  | 'allowed'
  | 'degraded'
  | 'rate_limited'
  | 'store_unavailable'
  | 'unexpected'
  | 'failed'

export type ProbeHeaders = {
  limit: string | null
  remaining: string | null
  reset: string | null
  retryAfter: string | null
  mode: string | null
}

export type ProbeResult = {
  sequence: number
  status: number | null
  outcome: ProbeOutcome
  description: string
  headers: ProbeHeaders
}

export type ProbeSummary = {
  allowed: number
  rateLimited: number
  degraded: number
  storeUnavailable: number
  unexpected: number
  failed: number
}

export type BatchStop = 'timeout' | 'deadline' | 'upstream'

export type BatchEnvelope = {
  completed: boolean
  requested: number
  error?: BatchStop
  results: ProbeResult[]
  summary: ProbeSummary
}

const EMPTY_HEADERS: ProbeHeaders = {
  limit: null,
  remaining: null,
  reset: null,
  retryAfter: null,
  mode: null,
}

export function emptyHeaders(): ProbeHeaders {
  return { ...EMPTY_HEADERS }
}

export function classifyStatus(status: number, mode: string | null): ProbeOutcome {
  if (status === 200 && mode === 'degraded') return 'degraded'
  if (status === 200 && mode === null) return 'allowed'
  if (status === 429) return 'rate_limited'
  if (status === 503) return 'store_unavailable'
  return 'unexpected'
}

export function describeOutcome(outcome: ProbeOutcome): string {
  switch (outcome) {
    case 'allowed':
      return 'Allowed'
    case 'degraded':
      return 'Admitted because the store failed. Not a normal quota allow.'
    case 'rate_limited':
      return 'Rejected by the rate limit.'
    case 'store_unavailable':
      return 'Store unavailable. Not a rate-limit rejection.'
    case 'unexpected':
      return 'Unexpected status.'
    case 'failed':
      return 'The request did not finish.'
  }
}

export function headerCell(value: string | null): string {
  return value === null ? 'Absent' : value
}

export function summarize(results: ProbeResult[]): ProbeSummary {
  const summary: ProbeSummary = {
    allowed: 0,
    rateLimited: 0,
    degraded: 0,
    storeUnavailable: 0,
    unexpected: 0,
    failed: 0,
  }
  for (const result of results) {
    if (result.outcome === 'allowed') summary.allowed += 1
    else if (result.outcome === 'rate_limited') summary.rateLimited += 1
    else if (result.outcome === 'degraded') summary.degraded += 1
    else if (result.outcome === 'store_unavailable') summary.storeUnavailable += 1
    else if (result.outcome === 'unexpected') summary.unexpected += 1
    else summary.failed += 1
  }
  return summary
}

export function readAllowlistedHeaders(headers: Headers): ProbeHeaders {
  return {
    limit: boundedHeader(headers, 'x-ratelimit-limit'),
    remaining: boundedHeader(headers, 'x-ratelimit-remaining'),
    reset: boundedHeader(headers, 'x-ratelimit-reset'),
    retryAfter: boundedHeader(headers, 'retry-after'),
    mode: boundedHeader(headers, 'x-ratelimit-mode'),
  }
}

export function resultFromStatus(sequence: number, status: number, headers: ProbeHeaders): ProbeResult {
  const outcome = classifyStatus(status, headers.mode)
  return {
    sequence,
    status,
    outcome,
    description: describeOutcome(outcome),
    headers,
  }
}

export function failedResult(sequence: number): ProbeResult {
  return {
    sequence,
    status: null,
    outcome: 'failed',
    description: describeOutcome('failed'),
    headers: emptyHeaders(),
  }
}

function boundedHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name)
  if (value === null || value.length === 0) return null
  return value.length > DEMO_HEADER_CAP ? value.slice(0, DEMO_HEADER_CAP) : value
}
