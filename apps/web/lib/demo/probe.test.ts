import { describe, expect, it } from 'vitest'
import { headerCell } from './classify'
import {
  DEMO_BATCH_DEADLINE_MS,
  DEMO_COOLDOWN_LABEL,
  DEMO_COOLDOWN_MS,
  DEMO_REQUEST_TIMEOUT_MS,
} from './constants'
import { createDemoProbeHandler, type ProbeEnv, type ProbeHandlerDeps } from './handler'
import { presentProbeHttp, scrapeFollowUp, scrapeNote } from './present'

const LOOPBACK = 'http://127.0.0.1:3001/api/demo-probe'
const API = 'http://127.0.0.1:3000'

function okResponse(status: number, headers: Record<string, string> = {}, body = '{"message":"ok"}') {
  return new Response(body, { status, headers })
}

function deps(overrides: Partial<ProbeHandlerDeps> & { env?: ProbeEnv; fetchImpl?: typeof fetch } = {}): ProbeHandlerDeps {
  return {
    now: () => 0,
    fetchImpl: async () => okResponse(200),
    timeoutMs: DEMO_REQUEST_TIMEOUT_MS,
    deadlineMs: DEMO_BATCH_DEADLINE_MS,
    cooldownMs: DEMO_COOLDOWN_MS,
    env: {
      NODE_ENV: 'development',
      THROTTLEFORGE_API_ORIGIN: API,
    },
    ...overrides,
  }
}

function post(url: string, origin: string | null, body: unknown = { count: 10 }, extra?: Record<string, string>) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (origin !== null) headers.set('origin', origin)
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value)
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe('demo probe constants', () => {
  it('uses the production bounds', () => {
    expect(DEMO_REQUEST_TIMEOUT_MS).toBe(2000)
    expect(DEMO_BATCH_DEADLINE_MS).toBe(15_000)
    expect(DEMO_COOLDOWN_MS).toBe(30_000)
  })
})

describe('POST /api/demo-probe', () => {
  it('rejects a count other than 10 and extra fields without fetching', async () => {
    let calls = 0
    const handle = createDemoProbeHandler(deps({ fetchImpl: async () => { calls += 1; return okResponse(200) } }))
    const badCount = await handle(post(LOOPBACK, 'http://127.0.0.1:3001', { count: 11 }))
    const smuggled = await handle(post(LOOPBACK, 'http://127.0.0.1:3001', { count: 10, url: 'http://evil.test/api/demo' }))
    expect(badCount.status).toBe(400)
    expect(smuggled.status).toBe(400)
    expect(calls).toBe(0)
  })

  it('keeps production disabled unless the setting is exactly enabled', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => { calls += 1; return okResponse(200) }
    for (const flag of [undefined, '', 'true', 'disabled']) {
      const handle = createDemoProbeHandler(deps({
        fetchImpl,
        env: { NODE_ENV: 'production', THROTTLEFORGE_DEMO_PROBE: flag, THROTTLEFORGE_API_ORIGIN: API, THROTTLEFORGE_CANONICAL_ORIGIN: 'https://demo.example.com' },
      }))
      const response = await handle(post('https://demo.example.com/api/demo-probe', 'https://demo.example.com'))
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'probe_disabled' })
    }
    const enabled = createDemoProbeHandler(deps({
      fetchImpl,
      env: { NODE_ENV: 'production', THROTTLEFORGE_DEMO_PROBE: 'enabled', THROTTLEFORGE_API_ORIGIN: API, THROTTLEFORGE_CANONICAL_ORIGIN: 'https://demo.example.com' },
    }))
    expect((await enabled(post('https://demo.example.com/api/demo-probe', 'https://demo.example.com'))).status).toBe(200)
    expect(calls).toBe(10)

    const devOff = createDemoProbeHandler(deps({
      fetchImpl,
      env: { NODE_ENV: 'development', THROTTLEFORGE_DEMO_PROBE: 'disabled', THROTTLEFORGE_API_ORIGIN: API },
    }))
    expect((await devOff(post(LOOPBACK, 'http://127.0.0.1:3001'))).status).toBe(403)
    expect(calls).toBe(10)
  })

  it('accepts a matching loopback origin and rejects missing, invalid, and mismatched origins', async () => {
    const calls: string[] = []
    const handle = createDemoProbeHandler(deps({
      fetchImpl: async (input) => {
        calls.push(String(input))
        return okResponse(200, { 'x-ratelimit-limit': '5' })
      },
    }))
    const ok = await handle(post(`${LOOPBACK}?url=http://evil.test&origin=http://169.254.169.254`, 'http://127.0.0.1:3001'))
    expect(ok.status).toBe(200)
    expect(calls).toEqual(Array.from({ length: 10 }, () => `${API}/api/demo`))

    const rejected = createDemoProbeHandler(deps({
      fetchImpl: async () => { throw new Error('should not fetch') },
    }))
    expect((await rejected(post(LOOPBACK, null))).status).toBe(403)
    expect((await rejected(post(LOOPBACK, 'not a url'))).status).toBe(403)
    expect((await rejected(post(LOOPBACK, 'http://localhost:3001'))).status).toBe(403)
    expect((await rejected(post(LOOPBACK, 'http://127.0.0.1:3001', { count: 10 }, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await rejected(post('http://public.example:3001/api/demo-probe', 'http://public.example:3001'))).status).toBe(403)
  })

  it('uses the canonical origin behind an internal request URL and ignores forwarded headers', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => { calls += 1; return okResponse(200) }
    const handle = createDemoProbeHandler(deps({
      fetchImpl,
      env: {
        NODE_ENV: 'production',
        THROTTLEFORGE_DEMO_PROBE: 'enabled',
        THROTTLEFORGE_CANONICAL_ORIGIN: 'https://demo.example.com',
        THROTTLEFORGE_API_ORIGIN: API,
      },
    }))
    const accepted = await handle(post('http://10.0.0.5:3001/api/demo-probe', 'https://demo.example.com', { count: 10 }, {
      host: 'demo.example.com',
      'x-forwarded-host': 'demo.example.com',
      'x-forwarded-proto': 'https',
    }))
    expect(accepted.status).toBe(200)
    expect(calls).toBe(10)

    const spoofed = createDemoProbeHandler(deps({
      fetchImpl: async () => { throw new Error('should not fetch') },
      env: { NODE_ENV: 'development', THROTTLEFORGE_API_ORIGIN: API },
    }))
    const rejected = await spoofed(post(LOOPBACK, 'https://demo.example.com', { count: 10 }, {
      host: 'demo.example.com',
      'x-forwarded-host': 'demo.example.com',
      'x-forwarded-proto': 'https',
    }))
    expect(rejected.status).toBe(403)

    for (const canonical of ['https://demo.example.com/app', 'https://user:pass@demo.example.com', 'file:///tmp', 'not-a-url', '']) {
      const invalid = createDemoProbeHandler(deps({
        fetchImpl: async () => { throw new Error('should not fetch') },
        env: { NODE_ENV: 'development', THROTTLEFORGE_CANONICAL_ORIGIN: canonical, THROTTLEFORGE_API_ORIGIN: API },
      }))
      expect((await invalid(post(LOOPBACK, 'http://127.0.0.1:3001'))).status).toBe(403)
    }

    const productionUnset = createDemoProbeHandler(deps({
      fetchImpl: async () => { throw new Error('should not fetch') },
      env: { NODE_ENV: 'production', THROTTLEFORGE_DEMO_PROBE: 'enabled', THROTTLEFORGE_API_ORIGIN: API },
    }))
    expect((await productionUnset(post(LOOPBACK, 'http://127.0.0.1:3001'))).status).toBe(403)
  })

  it('does not start a second batch while one is in flight', async () => {
    let calls = 0
    let release: () => void = () => {}
    const hold = new Promise<void>((resolve) => { release = resolve })
    let started: () => void = () => {}
    const startedP = new Promise<void>((resolve) => { started = resolve })
    const handle = createDemoProbeHandler(deps({
      fetchImpl: async () => {
        calls += 1
        if (calls === 1) started()
        await hold
        return okResponse(200)
      },
    }))
    const first = handle(post(LOOPBACK, 'http://127.0.0.1:3001'))
    await startedP
    const second = await handle(post(LOOPBACK, 'http://127.0.0.1:3001'))
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'batch_in_progress' })
    expect(calls).toBe(1)
    release()
    expect((await first).status).toBe(200)
  })

  it('enforces cooldown without counting it as a quota rejection', async () => {
    let now = 0
    let calls = 0
    const handle = createDemoProbeHandler(deps({
      now: () => now,
      fetchImpl: async () => { calls += 1; return okResponse(429, { 'retry-after': '9', 'x-ratelimit-remaining': '0' }) },
    }))
    const batch = await handle(post(LOOPBACK, 'http://127.0.0.1:3001'))
    const batchBody = await batch.json()
    expect(batch.status).toBe(200)
    expect(batchBody.summary.rateLimited).toBe(10)
    expect(batchBody.results).toHaveLength(10)
    expect(presentProbeHttp(batch.status, batchBody).kind).toBe('batch')

    const cooled = await handle(post(LOOPBACK, 'http://127.0.0.1:3001'))
    const cooledBody = await cooled.json()
    expect(cooled.status).toBe(429)
    expect(cooledBody).toEqual({ error: 'cooldown', retryAfterSec: 30 })
    expect(cooledBody.results).toBeUndefined()
    expect(calls).toBe(10)
    const view = presentProbeHttp(cooled.status, cooledBody)
    expect(view).toEqual({ kind: 'cooldown', label: DEMO_COOLDOWN_LABEL, retryAfterSec: 30 })

    now = DEMO_COOLDOWN_MS
    expect((await handle(post(LOOPBACK, 'http://127.0.0.1:3001'))).status).toBe(200)
    expect(calls).toBe(20)
  })

  it('keeps earlier rows when a later request fails, times out, or hits the deadline', async () => {
    let calls = 0
    const partial = createDemoProbeHandler(deps({
      fetchImpl: async () => {
        calls += 1
        if (calls <= 2) return okResponse(200, { 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '4', 'x-ratelimit-reset': '10' })
        throw new Error('redis://secret-should-not-leak')
      },
    }))
    const partialBody = await (await partial(post(LOOPBACK, 'http://127.0.0.1:3001'))).json()
    expect(partialBody.completed).toBe(false)
    expect(partialBody.error).toBe('upstream')
    expect(partialBody.results).toHaveLength(3)
    expect(partialBody.results[0].status).toBe(200)
    expect(partialBody.results[1].status).toBe(200)
    expect(partialBody.results[2].outcome).toBe('failed')
    expect(JSON.stringify(partialBody)).not.toContain('redis://secret')
    expect(calls).toBe(3)

    let timed = 0
    const timeout = createDemoProbeHandler(deps({
      timeoutMs: 20,
      deadlineMs: 15_000,
      fetchImpl: async (_input, init) => {
        timed += 1
        if (timed === 1) return okResponse(200, { 'x-ratelimit-limit': '5' })
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
      },
    }))
    const timeoutBody = await (await timeout(post(LOOPBACK, 'http://127.0.0.1:3001'))).json()
    expect(timeoutBody.error).toBe('timeout')
    expect(timeoutBody.results[0].outcome).toBe('allowed')
    expect(timeoutBody.results[1].outcome).toBe('failed')
    expect(timed).toBe(2)

    let clock = 0
    let paced = 0
    const deadline = createDemoProbeHandler(deps({
      now: () => clock,
      timeoutMs: 1000,
      deadlineMs: 25,
      fetchImpl: async () => {
        paced += 1
        clock += 10
        return okResponse(200, { 'x-ratelimit-limit': '5', 'x-unrelated': 'redis://nope' }, '{"secret":"redis://nope"}')
      },
    }))
    const deadlineBody = await (await deadline(post(LOOPBACK, 'http://127.0.0.1:3001'))).json()
    expect(deadlineBody.error).toBe('deadline')
    expect(deadlineBody.results).toHaveLength(3)
    expect(paced).toBe(3)
    expect(JSON.stringify(deadlineBody)).not.toContain('redis://nope')
    expect(deadlineBody.results[0].headers.limit).toBe('5')
  })

  it('records upstream 429, 503, degraded 200, and absent headers honestly', async () => {
    const statuses = [200, 429, 503, 200]
    let index = 0
    const handle = createDemoProbeHandler(deps({
      fetchImpl: async () => {
        const status = statuses[index] ?? 200
        index += 1
        if (status === 429) {
          return okResponse(429, {
            'x-ratelimit-limit': '5',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '99',
            'retry-after': '4',
          })
        }
        if (status === 503) return okResponse(503, { 'x-error': 'redis://secret' }, 'redis://secret-body')
        if (index === 4) return okResponse(200, { 'x-ratelimit-mode': 'degraded' }, 'store down redis://secret')
        return okResponse(200)
      },
    }))
    const body = await (await handle(post(LOOPBACK, 'http://127.0.0.1:3001'))).json()
    expect(body.results[0]).toMatchObject({ outcome: 'allowed', headers: { limit: null, remaining: null, reset: null, retryAfter: null, mode: null } })
    expect(headerCell(body.results[0].headers.limit)).toBe('Absent')
    expect(body.results[1].outcome).toBe('rate_limited')
    expect(body.results[1].headers.retryAfter).toBe('4')
    expect(body.results[2].outcome).toBe('store_unavailable')
    expect(body.results[2].description).toBe('Store unavailable. Not a rate-limit rejection.')
    expect(body.results[3].outcome).toBe('degraded')
    expect(body.summary.rateLimited).toBe(1)
    expect(body.summary.storeUnavailable).toBe(1)
    expect(body.summary.degraded).toBe(1)
    expect(JSON.stringify(body)).not.toContain('redis://secret')
  })
})

describe('scrape follow-up', () => {
  it('waits for a newer scrape and does not invent a metrics update', () => {
    expect(scrapeFollowUp(null, null)).toBe('unavailable')
    expect(scrapeFollowUp(100, 100)).toBe('waiting')
    expect(scrapeFollowUp(100, 200)).toBe('newer')
    expect(scrapeNote('waiting')).toContain('No newer scrape')
    expect(scrapeNote('newer')).toContain('not a copy of the table')
  })
})
