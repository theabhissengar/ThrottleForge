import { liveTargets } from './origin'
import { parsePrometheus } from './parse'
import { FETCH_TIMEOUT_MS, HEALTH_BYTE_CAP, METRICS_BYTE_CAP, readCapped } from './read-capped'
import type { LivePayload } from './types'

export async function scrapeApi(
  envValue: string | undefined,
  requestUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LivePayload> {
  const targets = liveTargets(envValue, requestUrl)
  const [health, metrics] = await Promise.all([
    readEndpoint(fetchImpl, targets.health, HEALTH_BYTE_CAP),
    readEndpoint(fetchImpl, targets.metrics, METRICS_BYTE_CAP),
  ])

  const payload: LivePayload = {
    fetchedAt: new Date().toISOString(),
    health: { state: 'unreachable' },
    metrics: { state: 'error', error: 'Metrics scrape failed' },
  }

  if (health.ok) {
    try {
      const body = JSON.parse(health.text) as { status?: unknown }
      payload.health = {
        state: 'reachable',
        status: typeof body.status === 'string' ? body.status : undefined,
      }
    } catch {
      payload.health = { state: 'unreachable', error: 'Health response was not JSON' }
    }
  } else {
    payload.health = { state: 'unreachable', error: health.error }
  }

  if (metrics.ok) {
    const parsed = parsePrometheus(metrics.text)
    if (parsed.ok) {
      payload.metrics = { state: 'ok', snapshot: parsed.snapshot }
    } else {
      payload.metrics = { state: 'error', error: parsed.error }
    }
  } else {
    payload.metrics = { state: 'error', error: metrics.error }
  }

  return payload
}

async function readEndpoint(
  fetchImpl: typeof fetch,
  url: string,
  cap: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const text = await readCapped(response, cap)
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }
    return { ok: true, text }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    if (message === 'response exceeded size cap') {
      return { ok: false, error: 'Response exceeded the size cap' }
    }
    return { ok: false, error: message }
  }
}
