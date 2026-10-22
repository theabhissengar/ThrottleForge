import { readCapped } from '../metrics/read-capped'
import {
  failedResult,
  readAllowlistedHeaders,
  resultFromStatus,
  summarize,
  type BatchEnvelope,
  type BatchStop,
  type ProbeResult,
} from './classify'
import { DEMO_BODY_CAP } from './constants'

export async function runDemoBatch(input: {
  url: string
  fetchImpl: typeof fetch
  now: () => number
  timeoutMs: number
  deadlineMs: number
  batchSize: number
}): Promise<BatchEnvelope> {
  const started = input.now()
  const deadlineAt = started + input.deadlineMs
  const results: ProbeResult[] = []

  for (let sequence = 1; sequence <= input.batchSize; sequence += 1) {
    const remaining = deadlineAt - input.now()
    if (remaining <= 0) return envelope(input.batchSize, results, 'deadline')
    const budget = Math.min(input.timeoutMs, remaining)
    let response: Response
    try {
      response = await input.fetchImpl(input.url, {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(budget),
      })
    } catch (error) {
      results.push(failedResult(sequence))
      return envelope(input.batchSize, results, stopFor(error, budget, input.timeoutMs))
    }
    try {
      await readCapped(response, DEMO_BODY_CAP)
    } catch {
      results.push(failedResult(sequence))
      return envelope(input.batchSize, results, 'upstream')
    }
    results.push(resultFromStatus(sequence, response.status, readAllowlistedHeaders(response.headers)))
  }

  return envelope(input.batchSize, results)
}

function envelope(requested: number, results: ProbeResult[], error?: BatchStop): BatchEnvelope {
  const completed = error === undefined && results.length === requested && results.every((result) => result.outcome !== 'failed')
  return {
    completed,
    requested,
    ...(error ? { error } : {}),
    results,
    summary: summarize(results),
  }
}

function stopFor(error: unknown, budget: number, timeoutMs: number): BatchStop {
  const name = error instanceof Error ? error.name : ''
  if (name === 'AbortError' || name === 'TimeoutError') {
    return budget < timeoutMs ? 'deadline' : 'timeout'
  }
  return 'upstream'
}
