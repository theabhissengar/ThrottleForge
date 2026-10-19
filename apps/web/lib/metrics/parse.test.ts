import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePrometheus } from './parse'

const fixtures = dirname(fileURLToPath(import.meta.url))

function fixture(name: string): string {
  return readFileSync(join(fixtures, 'fixtures', name), 'utf8')
}

describe('parsePrometheus', () => {
  it('treats an idle scrape as help and type with no samples', () => {
    const parsed = parsePrometheus(fixture('idle.prom'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.allowed).toEqual({ value: 0, presence: 'absent' })
    expect(parsed.snapshot.rejected).toEqual({ value: 0, presence: 'absent' })
    expect(parsed.snapshot.failures).toEqual({ value: 0, presence: 'absent' })
    expect(parsed.snapshot.degraded).toEqual({ value: 0, presence: 'absent' })
    expect(parsed.snapshot.store).toBeNull()
    expect(parsed.snapshot.algorithm).toBeNull()
    expect(parsed.snapshot.histogram.meanSeconds).toBeNull()
    expect(parsed.snapshot.histogram.buckets).toEqual([])
    expect(parsed.snapshot).not.toHaveProperty('p95')
  })

  it('parses a real non-idle scrape, including cumulative buckets and +Inf', () => {
    const parsed = parsePrometheus(fixture('sampled.prom'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.allowed).toEqual({ value: 5, presence: 'reported' })
    expect(parsed.snapshot.rejected).toEqual({ value: 1, presence: 'reported' })
    expect(parsed.snapshot.store).toBe('redis')
    expect(parsed.snapshot.algorithm).toBe('fixed_window')
    expect(parsed.snapshot.histogram.count).toEqual({ value: 6, presence: 'reported' })
    const inf = parsed.snapshot.histogram.buckets.find((bucket) => bucket.le === '+Inf')
    expect(inf).toEqual({ le: '+Inf', cumulative: 6, openEnded: true })
    const first = parsed.snapshot.histogram.buckets[0]
    expect(first.le).toBe('0.00005')
    expect(parsed.snapshot.histogram.meanSeconds).toBeCloseTo((0.0106669 + 0.0013085) / 6)
    expect(parsed.snapshot).not.toHaveProperty('p95')
  })

  it('distinguishes a reported zero from a missing sample', () => {
    const parsed = parsePrometheus(
      [
        '# TYPE throttleforge_rate_limit_requests_total counter',
        'throttleforge_rate_limit_requests_total{algorithm="fixed_window",result="allowed",store="memory"} 0',
      ].join('\n'),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.allowed).toEqual({ value: 0, presence: 'reported' })
    expect(parsed.snapshot.rejected).toEqual({ value: 0, presence: 'absent' })
    expect(parsed.snapshot.store).toBe('memory')
  })

  it('drops names outside the allowlist', () => {
    const parsed = parsePrometheus(
      [
        'http_requests_total{path="/api/demo"} 9',
        'throttleforge_rate_limit_degraded_requests_total{algorithm="fixed_window",store="memory"} 2',
      ].join('\n'),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.degraded).toEqual({ value: 2, presence: 'reported' })
    expect(parsed.snapshot.allowed.presence).toBe('absent')
  })

  it('rejects malformed sample lines', () => {
    const parsed = parsePrometheus('this is not a metric\n')
    expect(parsed.ok).toBe(false)
  })

  it('omits the mean when the histogram count is zero', () => {
    const parsed = parsePrometheus(
      'throttleforge_rate_limit_operation_duration_seconds_count{algorithm="fixed_window",result="allowed",store="memory"} 0\n',
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.histogram.meanSeconds).toBeNull()
    expect(parsed.snapshot.histogram.count).toEqual({ value: 0, presence: 'reported' })
  })
})
