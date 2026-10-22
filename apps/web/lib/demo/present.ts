import { DEMO_COOLDOWN_LABEL } from './constants'
import type { BatchEnvelope, ProbeHeaders, ProbeOutcome, ProbeResult, ProbeSummary } from './classify'

export type ProbePresentation =
  | { kind: 'cooldown'; label: typeof DEMO_COOLDOWN_LABEL; retryAfterSec: number }
  | { kind: 'batch'; envelope: BatchEnvelope }
  | { kind: 'message'; text: string }

const OUTCOMES: readonly ProbeOutcome[] = [
  'allowed',
  'degraded',
  'rate_limited',
  'store_unavailable',
  'unexpected',
  'failed',
]

export function presentProbeHttp(status: number, body: unknown): ProbePresentation {
  if (status === 429 && isCooldown(body)) {
    return { kind: 'cooldown', label: DEMO_COOLDOWN_LABEL, retryAfterSec: body.retryAfterSec }
  }
  if (status === 200) {
    const envelope = parseEnvelope(body)
    if (envelope) return { kind: 'batch', envelope }
  }
  return { kind: 'message', text: messageFor(status, body) }
}

export function scrapeFollowUp(remembered: number | null, current: number | null): 'unavailable' | 'waiting' | 'newer' {
  if (remembered === null && current === null) return 'unavailable'
  if (current === remembered) return 'waiting'
  if (current !== null) return 'newer'
  return 'waiting'
}

export function scrapeNote(kind: 'unavailable' | 'waiting' | 'newer'): string {
  if (kind === 'unavailable') {
    return 'No successful metrics scrape is available. The rows above are the demonstration responses. The counters below are not a copy of those rows.'
  }
  if (kind === 'waiting') {
    return 'No newer scrape has arrived since this demonstration. The counters below are still the previous reading. The next reading follows the existing 5 second refresh.'
  }
  return 'A newer scrape arrived. The Allowed, Rejected, Degraded, and Store failure figures are cumulative Prometheus samples. The smaller notes are the change between scrapes in this browser. They can include other requests, and they are not a copy of the table above.'
}

function isCooldown(body: unknown): body is { error: 'cooldown'; retryAfterSec: number } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false
  const record = body as Record<string, unknown>
  return record.error === 'cooldown' && typeof record.retryAfterSec === 'number' && Number.isFinite(record.retryAfterSec)
}

function messageFor(status: number, body: unknown): string {
  const code = errorCode(body)
  if (status === 400 || code === 'invalid_input') return 'The demonstration request was rejected.'
  if (code === 'probe_disabled') return 'The request demonstration is disabled.'
  if (code === 'origin_rejected') return 'This page could not confirm that the request came from this site.'
  if (status === 409 || code === 'batch_in_progress') return 'A demonstration is already running.'
  if (code === 'origin_invalid') return 'The demonstration could not reach the configured API.'
  return 'The demonstration could not complete.'
}

function errorCode(body: unknown): string | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const error = (body as { error?: unknown }).error
  return typeof error === 'string' ? error : null
}

function parseEnvelope(body: unknown): BatchEnvelope | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (typeof record.completed !== 'boolean') return null
  if (record.requested !== 10) return null
  if (!Array.isArray(record.results)) return null
  const results: ProbeResult[] = []
  for (const entry of record.results) {
    const result = parseResult(entry)
    if (!result) return null
    results.push(result)
  }
  const summary = parseSummary(record.summary)
  if (!summary) return null
  if (record.error !== undefined && record.error !== 'timeout' && record.error !== 'deadline' && record.error !== 'upstream') {
    return null
  }
  return {
    completed: record.completed,
    requested: 10,
    ...(record.error ? { error: record.error } : {}),
    results,
    summary,
  }
}

function parseResult(value: unknown): ProbeResult | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.sequence !== 'number' || !Number.isInteger(record.sequence)) return null
  if (!(record.status === null || (typeof record.status === 'number' && Number.isInteger(record.status)))) return null
  if (typeof record.outcome !== 'string' || !OUTCOMES.includes(record.outcome as ProbeOutcome)) return null
  if (typeof record.description !== 'string') return null
  const headers = parseHeaders(record.headers)
  if (!headers) return null
  return {
    sequence: record.sequence,
    status: record.status,
    outcome: record.outcome as ProbeOutcome,
    description: record.description,
    headers,
  }
}

function parseHeaders(value: unknown): ProbeHeaders | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const headers = {
    limit: headerValue(record.limit),
    remaining: headerValue(record.remaining),
    reset: headerValue(record.reset),
    retryAfter: headerValue(record.retryAfter),
    mode: headerValue(record.mode),
  }
  if (Object.values(headers).some((entry) => entry === undefined)) return null
  return headers as ProbeHeaders
}

function headerValue(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value
  return undefined
}

function parseSummary(value: unknown): ProbeSummary | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = ['allowed', 'rateLimited', 'degraded', 'storeUnavailable', 'unexpected', 'failed'] as const
  const summary = {} as ProbeSummary
  for (const key of keys) {
    const count = record[key]
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null
    summary[key] = count
  }
  return summary
}
