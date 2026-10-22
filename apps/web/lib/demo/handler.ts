import { apiUrl } from '../metrics/origin'
import { isExactDemoBody, probeEnabled } from './access'
import { originAllowed, resolveExpectedOrigin } from './expected-origin'
import { createProbeGate } from './gate'
import { runDemoBatch } from './run-batch'
import { DEMO_BATCH_SIZE } from './constants'

export type ProbeEnv = {
  NODE_ENV?: string
  THROTTLEFORGE_DEMO_PROBE?: string
  THROTTLEFORGE_CANONICAL_ORIGIN?: string
  THROTTLEFORGE_API_ORIGIN?: string
}

export type ProbeHandlerDeps = {
  now: () => number
  fetchImpl: typeof fetch
  timeoutMs: number
  deadlineMs: number
  cooldownMs: number
  env: ProbeEnv
}

const ORIGIN_INVALID = new Set([
  'THROTTLEFORGE_API_ORIGIN is not a valid URL',
  'THROTTLEFORGE_API_ORIGIN must use http or https',
])

export function createDemoProbeHandler(deps: ProbeHandlerDeps) {
  const gate = createProbeGate(deps.now, deps.cooldownMs)

  return async function handleDemoProbe(request: Request): Promise<Response> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return coded(400, 'invalid_input')
    }
    if (!isExactDemoBody(body)) return coded(400, 'invalid_input')
    if (!probeEnabled(deps.env.NODE_ENV, deps.env.THROTTLEFORGE_DEMO_PROBE)) {
      return coded(403, 'probe_disabled')
    }

    const expected = resolveExpectedOrigin({
      nodeEnv: deps.env.NODE_ENV,
      canonical: deps.env.THROTTLEFORGE_CANONICAL_ORIGIN,
      requestUrl: request.url,
    })
    if (!expected.ok) return coded(403, 'origin_rejected')
    if (!originAllowed(expected.origin, request.headers.get('origin'), request.headers.get('sec-fetch-site'))) {
      return coded(403, 'origin_rejected')
    }

    let target: string
    try {
      target = apiUrl(deps.env.THROTTLEFORGE_API_ORIGIN, request.url, 'demo')
    } catch (error) {
      const message = error instanceof Error && ORIGIN_INVALID.has(error.message)
        ? error.message
        : 'THROTTLEFORGE_API_ORIGIN is not a valid URL'
      return Response.json({ error: 'origin_invalid', message }, { status: 500 })
    }

    const acquired = gate.tryAcquire()
    if (!acquired.ok) {
      if (acquired.error === 'cooldown') {
        return Response.json({ error: 'cooldown', retryAfterSec: acquired.retryAfterSec }, { status: 429 })
      }
      return coded(409, 'batch_in_progress')
    }

    try {
      const envelope = await runDemoBatch({
        url: target,
        fetchImpl: deps.fetchImpl,
        now: deps.now,
        timeoutMs: deps.timeoutMs,
        deadlineMs: deps.deadlineMs,
        batchSize: DEMO_BATCH_SIZE,
      })
      return Response.json(envelope)
    } catch {
      return Response.json({
        completed: false,
        requested: DEMO_BATCH_SIZE,
        error: 'upstream',
        results: [],
        summary: {
          allowed: 0,
          rateLimited: 0,
          degraded: 0,
          storeUnavailable: 0,
          unexpected: 0,
          failed: 0,
        },
      })
    } finally {
      gate.release()
    }
  }
}

function coded(status: number, error: string): Response {
  return Response.json({ error }, { status })
}
