import type { CountReading, HistogramBucket, MetricsSnapshot, ParseResult } from './types'

const ALLOWED_NAMES = new Set([
  'throttleforge_rate_limit_requests_total',
  'throttleforge_rate_limit_store_failures_total',
  'throttleforge_rate_limit_degraded_requests_total',
  'throttleforge_rate_limit_operation_duration_seconds_bucket',
  'throttleforge_rate_limit_operation_duration_seconds_sum',
  'throttleforge_rate_limit_operation_duration_seconds_count',
])

const REQUESTS = 'throttleforge_rate_limit_requests_total'
const FAILURES = 'throttleforge_rate_limit_store_failures_total'
const DEGRADED = 'throttleforge_rate_limit_degraded_requests_total'
const DURATION_BUCKET = 'throttleforge_rate_limit_operation_duration_seconds_bucket'
const DURATION_SUM = 'throttleforge_rate_limit_operation_duration_seconds_sum'
const DURATION_COUNT = 'throttleforge_rate_limit_operation_duration_seconds_count'

type Sample = {
  name: string
  labels: Record<string, string>
  value: number
}

export function parsePrometheus(text: string): ParseResult {
  let samples: Sample[]
  try {
    samples = collectSamples(text)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Metrics text could not be parsed',
    }
  }
  return { ok: true, snapshot: snapshotFromSamples(samples) }
}

function collectSamples(text: string): Sample[] {
  const samples: Sample[] = []
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const sample = parseSampleLine(line, index + 1)
    if (!ALLOWED_NAMES.has(sample.name)) continue
    samples.push(sample)
  }
  return samples
}

function parseSampleLine(line: string, lineNumber: number): Sample {
  const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\S+)?$/.exec(line)
  if (!match) {
    throw new Error(`Malformed metrics sample on line ${lineNumber}`)
  }
  const value = Number(match[3])
  if (!Number.isFinite(value)) {
    throw new Error(`Malformed metrics value on line ${lineNumber}`)
  }
  return {
    name: match[1],
    labels: match[2] === undefined ? {} : parseLabels(match[2], lineNumber),
    value,
  }
}

function parseLabels(body: string, lineNumber: number): Record<string, string> {
  const labels: Record<string, string> = {}
  if (body.length === 0) return labels
  let index = 0
  while (index < body.length) {
    while (body[index] === ',' || body[index] === ' ') index += 1
    if (index >= body.length) break
    const nameEnd = body.indexOf('=', index)
    if (nameEnd === -1) {
      throw new Error(`Malformed metrics labels on line ${lineNumber}`)
    }
    const name = body.slice(index, nameEnd)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || body[nameEnd + 1] !== '"') {
      throw new Error(`Malformed metrics labels on line ${lineNumber}`)
    }
    let cursor = nameEnd + 2
    let value = ''
    let closed = false
    while (cursor < body.length) {
      const char = body[cursor]
      if (char === '\\') {
        const next = body[cursor + 1]
        if (next === 'n') value += '\n'
        else if (next === '\\' || next === '"') value += next
        else throw new Error(`Malformed metrics labels on line ${lineNumber}`)
        cursor += 2
        continue
      }
      if (char === '"') {
        closed = true
        cursor += 1
        break
      }
      value += char
      cursor += 1
    }
    if (!closed) throw new Error(`Malformed metrics labels on line ${lineNumber}`)
    labels[name] = value
    index = cursor
  }
  return labels
}

function snapshotFromSamples(samples: Sample[]): MetricsSnapshot {
  const allowed = sumResult(samples, REQUESTS, 'allowed')
  const rejected = sumResult(samples, REQUESTS, 'rejected')
  const failures = sumName(samples, FAILURES)
  const degraded = sumName(samples, DEGRADED)
  const identity = samples.filter((sample) => sample.name !== DURATION_BUCKET)
  const histogram = histogramFrom(samples)
  return {
    allowed,
    rejected,
    failures,
    degraded,
    store: singleLabel(identity, 'store'),
    algorithm: singleLabel(identity, 'algorithm'),
    histogram,
  }
}

function sumResult(samples: Sample[], name: string, result: string): CountReading {
  const matched = samples.filter(
    (sample) => sample.name === name && sample.labels.result === result,
  )
  return reading(matched)
}

function sumName(samples: Sample[], name: string): CountReading {
  return reading(samples.filter((sample) => sample.name === name))
}

function reading(matched: Sample[]): CountReading {
  if (matched.length === 0) return { value: 0, presence: 'absent' }
  return {
    value: matched.reduce((total, sample) => total + sample.value, 0),
    presence: 'reported',
  }
}

function singleLabel(samples: Sample[], key: string): string | null {
  const values = new Set<string>()
  for (const sample of samples) {
    const value = sample.labels[key]
    if (value) values.add(value)
  }
  if (values.size === 0) return null
  return [...values].sort().join(', ')
}

function histogramFrom(samples: Sample[]): MetricsSnapshot['histogram'] {
  const counts = samples.filter((sample) => sample.name === DURATION_COUNT)
  const sums = samples.filter((sample) => sample.name === DURATION_SUM)
  const count = reading(counts)
  const sum = sums.length === 0 ? null : sums.reduce((total, sample) => total + sample.value, 0)
  const meanSeconds = count.value > 0 && sum !== null ? sum / count.value : null
  const bucketTotals = new Map<string, number>()
  for (const sample of samples) {
    if (sample.name !== DURATION_BUCKET) continue
    const le = sample.labels.le
    if (!le) continue
    bucketTotals.set(le, (bucketTotals.get(le) ?? 0) + sample.value)
  }
  const buckets: HistogramBucket[] = [...bucketTotals.entries()]
    .sort((left, right) => compareLe(left[0], right[0]))
    .map(([le, cumulative]) => ({
      le,
      cumulative,
      openEnded: le === '+Inf',
    }))
  return { count, sum, meanSeconds, buckets }
}

function compareLe(left: string, right: string): number {
  if (left === '+Inf') return 1
  if (right === '+Inf') return -1
  return Number(left) - Number(right)
}
