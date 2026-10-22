import { describe, expect, it } from 'vitest'
import { FETCH_TIMEOUT_MS, HEALTH_BYTE_CAP, METRICS_BYTE_CAP, readCapped } from './read-capped'
import { apiUrl, liveTargets } from './origin'
import { scrapeApi } from './scrape'

describe('liveTargets', () => {
  it('ignores url and origin query parameters', () => {
    const targets = liveTargets(
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001/api/live?url=http://evil.test/metrics&origin=http://169.254.169.254',
    )
    expect(targets).toEqual({
      health: 'http://127.0.0.1:3000/health',
      metrics: 'http://127.0.0.1:3000/metrics',
    })
  })

  it('defaults to the local API origin', () => {
    expect(liveTargets(undefined, 'http://127.0.0.1:3001/api/live').metrics).toBe(
      'http://127.0.0.1:3000/metrics',
    )
  })

  it('rejects a non-http origin', () => {
    expect(() => liveTargets('file:///tmp/metrics', 'http://127.0.0.1:3001/api/live')).toThrow(
      /http or https/,
    )
  })
})

describe('apiUrl', () => {
  it('builds only the fixed demo and policy paths', () => {
    const request = 'http://127.0.0.1:3001/api/demo-probe?url=http://evil.test&origin=http://169.254.169.254'
    expect(apiUrl('http://127.0.0.1:3000/ignored', request, 'demo')).toBe('http://127.0.0.1:3000/api/demo')
    expect(apiUrl('https://api.internal:3000', request, 'policy')).toBe(
      'https://api.internal:3000/api/rate-limit/policy',
    )
  })
})

describe('scrapeApi', () => {
  it('fetches only the env origin even when the request names another host', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      }
      return new Response('# TYPE throttleforge_rate_limit_requests_total counter\n', {
        status: 200,
      })
    }
    const payload = await scrapeApi(
      'http://127.0.0.1:3000/ignored-path',
      'http://127.0.0.1:3001/api/live?origin=http://evil.test',
      fetchImpl,
    )
    expect(calls.sort()).toEqual(['http://127.0.0.1:3000/health', 'http://127.0.0.1:3000/metrics'])
    expect(payload.health.state).toBe('reachable')
    expect(payload.metrics.state).toBe('ok')
    expect(payload.metrics.snapshot?.allowed.presence).toBe('absent')
  })
})

describe('readCapped', () => {
  it('rejects a body over the metrics cap', async () => {
    expect(METRICS_BYTE_CAP).toBe(256 * 1024)
    expect(HEALTH_BYTE_CAP).toBe(16 * 1024)
    expect(FETCH_TIMEOUT_MS).toBe(2000)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(32))
        controller.close()
      },
    })
    await expect(readCapped(new Response(stream), 8)).rejects.toThrow(/size cap/)
  })
})
