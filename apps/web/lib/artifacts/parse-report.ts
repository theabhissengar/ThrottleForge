import type {
  AdaptiveReport,
  AdaptiveRunner,
  AdaptiveScenario,
  ArtifactMetadata,
  ArtifactReport,
  CompareReport,
  CompareResult,
  CoreReport,
  HttpReport,
  LatencySummary,
  RedisMismatch,
  RedisReport,
  TimingBlock,
} from './types'

export type ParseArtifactResult =
  | { ok: true; report: ArtifactReport }
  | { ok: false; error: string }

const KNOWN_MODES = ['core', 'http', 'compare', 'redis-compare', 'adaptive-compare'] as const

export function parseArtifact(text: string): ParseArtifactResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (!isRecord(data)) {
    return { ok: false, error: 'JSON root must be an object.' }
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'mode')) {
    return { ok: false, error: 'JSON is missing mode.' }
  }
  if (typeof data.mode !== 'string') {
    return { ok: false, error: 'mode must be a string.' }
  }
  try {
    switch (data.mode) {
      case 'compare':
        return { ok: true, report: parseCompare(data) }
      case 'core':
        return { ok: true, report: parseCore(data) }
      case 'http':
        return { ok: true, report: parseHttp(data) }
      case 'redis-compare':
        return { ok: true, report: parseRedis(data) }
      case 'adaptive-compare':
        return { ok: true, report: parseAdaptive(data) }
      default:
        return {
          ok: false,
          error: `Unknown mode "${data.mode}". Expected ${KNOWN_MODES.join(', ')}.`,
        }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Artifact is incomplete.',
    }
  }
}

export function artifactMetadata(report: ArtifactReport): ArtifactMetadata[] {
  const rows: ArtifactMetadata[] = [{ label: 'mode', value: report.mode }]
  if (report.mode === 'compare' || report.mode === 'redis-compare') {
    rows.push({ label: 'scenario', value: report.scenario })
    rows.push({ label: 'limit', value: String(report.limit) })
    rows.push({ label: 'windowMs', value: String(report.windowMs) })
  }
  if (report.mode === 'core') {
    rows.push({ label: 'algorithm', value: report.algorithm })
    rows.push({ label: 'pattern', value: report.pattern })
    rows.push({ label: 'requests', value: String(report.requests) })
    rows.push({ label: 'limit', value: String(report.limit) })
    rows.push({ label: 'windowMs', value: String(report.windowMs) })
  }
  if (report.mode === 'http') {
    rows.push({ label: 'baseUrl', value: report.baseUrl })
    rows.push({ label: 'pattern', value: report.pattern })
    rows.push({ label: 'requests', value: String(report.requests) })
  }
  if (report.mode === 'adaptive-compare') {
    rows.push({ label: 'windowMs', value: String(report.parameters.windowMs) })
  }
  return rows
}

function parseCompare(data: Record<string, unknown>): CompareReport {
  const results = arrayOf(data, 'results', 'compare').map((entry, index) =>
    parseCompareResult(entry, `compare.results[${index}]`),
  )
  return {
    mode: 'compare',
    scenario: str(data, 'scenario', 'compare'),
    limit: num(data, 'limit', 'compare'),
    windowMs: num(data, 'windowMs', 'compare'),
    traceLength: num(data, 'traceLength', 'compare'),
    results,
  }
}

function parseCompareResult(value: unknown, path: string): CompareResult {
  const data = record(value, path)
  const correctness = record(data.correctness, `${path}.correctness`)
  return {
    algorithm: str(data, 'algorithm', path),
    correctness: {
      allowed: num(correctness, 'allowed', `${path}.correctness`),
      rejected: num(correctness, 'rejected', `${path}.correctness`),
      unexpectedErrors: num(correctness, 'unexpectedErrors', `${path}.correctness`),
      storeSizeAfter: num(correctness, 'storeSizeAfter', `${path}.correctness`),
    },
    observational: parseTiming(data.observational, `${path}.observational`),
  }
}

function parseCore(data: Record<string, unknown>): CoreReport {
  const report: CoreReport = {
    mode: 'core',
    algorithm: str(data, 'algorithm', 'core'),
    pattern: str(data, 'pattern', 'core'),
    requests: num(data, 'requests', 'core'),
    concurrency: num(data, 'concurrency', 'core'),
    limit: num(data, 'limit', 'core'),
    windowMs: num(data, 'windowMs', 'core'),
    allowed: num(data, 'allowed', 'core'),
    rejected: num(data, 'rejected', 'core'),
    errors: num(data, 'errors', 'core'),
    elapsedMs: num(data, 'elapsedMs', 'core'),
    throughputRps: numOrNull(data, 'throughputRps', 'core'),
    latency: parseLatency(data.latency, 'core.latency'),
    storeSizeBefore: num(data, 'storeSizeBefore', 'core'),
  }
  copyOptionalNumber(data, report, 'storeSizeAfter')
  copyOptionalNumber(data, report, 'storeSizeAtBoundary')
  copyOptionalNumber(data, report, 'storeSizeAfterTraffic')
  copyOptionalNumber(data, report, 'storeSizeAfterWindowAdvanceAndSweep')
  return report
}

function parseHttp(data: Record<string, unknown>): HttpReport {
  const metrics = record(data.observationalMetrics, 'http.observationalMetrics')
  const observationalMetrics: Record<string, number | string | null> = {}
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number' || typeof value === 'string' || value === null) {
      observationalMetrics[key] = value
    }
  }
  return {
    mode: 'http',
    baseUrl: str(data, 'baseUrl', 'http'),
    path: str(data, 'path', 'http'),
    pattern: str(data, 'pattern', 'http'),
    requests: num(data, 'requests', 'http'),
    concurrency: num(data, 'concurrency', 'http'),
    success: num(data, 'success', 'http'),
    expectedRateLimited: num(data, 'expectedRateLimited', 'http'),
    unexpectedStatus: num(data, 'unexpectedStatus', 'http'),
    transportErrors: num(data, 'transportErrors', 'http'),
    elapsedMs: num(data, 'elapsedMs', 'http'),
    throughputRps: numOrNull(data, 'throughputRps', 'http'),
    latency: parseLatency(data.latency, 'http.latency'),
    observationalMetrics,
  }
}

function parseRedis(data: Record<string, unknown>): RedisReport {
  const correctness = record(data.correctness, 'redis-compare.correctness')
  const observational = record(data.observational, 'redis-compare.observational')
  return {
    mode: 'redis-compare',
    scenario: str(data, 'scenario', 'redis-compare'),
    limit: num(data, 'limit', 'redis-compare'),
    windowMs: num(data, 'windowMs', 'redis-compare'),
    traceLength: num(data, 'traceLength', 'redis-compare'),
    correctness: {
      matched: bool(correctness, 'matched', 'redis-compare.correctness'),
      mismatches: arrayOf(correctness, 'mismatches', 'redis-compare.correctness').map(
        (entry, index) => parseMismatch(entry, `redis-compare.correctness.mismatches[${index}]`),
      ),
    },
    observational: {
      memory: parseTiming(observational.memory, 'redis-compare.observational.memory'),
      redis: parseTiming(observational.redis, 'redis-compare.observational.redis'),
    },
  }
}

function parseMismatch(value: unknown, path: string): RedisMismatch {
  const data = record(value, path)
  return {
    index: num(data, 'index', path),
    memory: parseDecision(data.memory, `${path}.memory`),
    redis: parseDecision(data.redis, `${path}.redis`),
  }
}

function parseDecision(
  value: unknown,
  path: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  const data = record(value, path)
  return {
    allowed: bool(data, 'allowed', path),
    remaining: num(data, 'remaining', path),
    resetAt: num(data, 'resetAt', path),
  }
}

function parseAdaptive(data: Record<string, unknown>): AdaptiveReport {
  const parameters = record(data.parameters, 'adaptive-compare.parameters')
  const correctness = record(data.correctness, 'adaptive-compare.correctness')
  const means = record(correctness.means, 'adaptive-compare.correctness.means')
  const comparisons = record(correctness.comparisons, 'adaptive-compare.correctness.comparisons')
  const observational = record(data.observational, 'adaptive-compare.observational')
  return {
    mode: 'adaptive-compare',
    parameters: {
      floor: num(parameters, 'floor', 'adaptive-compare.parameters'),
      initial: num(parameters, 'initial', 'adaptive-compare.parameters'),
      ceiling: num(parameters, 'ceiling', 'adaptive-compare.parameters'),
      windowMs: num(parameters, 'windowMs', 'adaptive-compare.parameters'),
      base: num(parameters, 'base', 'adaptive-compare.parameters'),
      perClientReferenceLimit: num(
        parameters,
        'perClientReferenceLimit',
        'adaptive-compare.parameters',
      ),
      globalKey: str(parameters, 'globalKey', 'adaptive-compare.parameters'),
    },
    correctness: {
      scenarios: arrayOf(correctness, 'scenarios', 'adaptive-compare.correctness').map(
        (entry, index) => parseScenario(entry, `adaptive-compare.correctness.scenarios[${index}]`),
      ),
      means: {
        adaptive: num(means, 'adaptive', 'adaptive-compare.correctness.means'),
        'static-floor': num(means, 'static-floor', 'adaptive-compare.correctness.means'),
        'static-ceiling': num(means, 'static-ceiling', 'adaptive-compare.correctness.means'),
        'static-oracle': num(means, 'static-oracle', 'adaptive-compare.correctness.means'),
      },
      comparisons: {
        adaptiveBeatsStaticFloor: bool(
          comparisons,
          'adaptiveBeatsStaticFloor',
          'adaptive-compare.correctness.comparisons',
        ),
        adaptiveBeatsStaticCeiling: bool(
          comparisons,
          'adaptiveBeatsStaticCeiling',
          'adaptive-compare.correctness.comparisons',
        ),
        passed: bool(comparisons, 'passed', 'adaptive-compare.correctness.comparisons'),
      },
      conclusion: str(correctness, 'conclusion', 'adaptive-compare.correctness'),
    },
    observational: {
      elapsedMs: num(observational, 'elapsedMs', 'adaptive-compare.observational'),
    },
  }
}

function parseScenario(value: unknown, path: string): AdaptiveScenario {
  const data = record(value, path)
  return {
    scenario: str(data, 'scenario', path),
    inPassSet: bool(data, 'inPassSet', path),
    initialCapacity: num(data, 'initialCapacity', path),
    traceLength: num(data, 'traceLength', path),
    runners: arrayOf(data, 'runners', path).map((entry, index) =>
      parseRunner(entry, `${path}.runners[${index}]`),
    ),
  }
}

function parseRunner(value: unknown, path: string): AdaptiveRunner {
  const data = record(value, path)
  const outcomes = record(data.outcomes, `${path}.outcomes`)
  const admitted = record(data.perClientAdmitted, `${path}.perClientAdmitted`)
  const perClientAdmitted: Record<string, number> = {}
  for (const [key, count] of Object.entries(admitted)) {
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      throw new Error(`${path}.perClientAdmitted.${key} must be a finite number`)
    }
    perClientAdmitted[key] = count
  }
  const runner: AdaptiveRunner = {
    runner: str(data, 'runner', path),
    usesController: bool(data, 'usesController', path),
    offered: num(data, 'offered', path),
    admitted: num(data, 'admitted', path),
    rejected: num(data, 'rejected', path),
    shortfall: num(data, 'shortfall', path),
    excess: num(data, 'excess', path),
    regret: num(data, 'regret', path),
    normalizedRegret: num(data, 'normalizedRegret', path),
    limitsInForce: numList(data.limitsInForce, `${path}.limitsInForce`),
    offeredByWindow: numList(data.offeredByWindow, `${path}.offeredByWindow`),
    admittedByWindow: numList(data.admittedByWindow, `${path}.admittedByWindow`),
    outcomes: {
      increase: num(outcomes, 'increase', `${path}.outcomes`),
      decrease: num(outcomes, 'decrease', `${path}.outcomes`),
      hold: num(outcomes, 'hold', `${path}.outcomes`),
    },
    perClientAdmitted,
  }
  if (data.limitAfterUpdate !== undefined) {
    runner.limitAfterUpdate = numList(data.limitAfterUpdate, `${path}.limitAfterUpdate`)
  }
  return runner
}

function parseTiming(value: unknown, path: string): TimingBlock {
  const data = record(value, path)
  return {
    elapsedMs: num(data, 'elapsedMs', path),
    throughputRps: numOrNull(data, 'throughputRps', path),
    latency: parseLatency(data.latency, `${path}.latency`),
  }
}

function parseLatency(value: unknown, path: string): LatencySummary {
  const data = record(value, path)
  return {
    p50Ms: num(data, 'p50Ms', path),
    p95Ms: num(data, 'p95Ms', path),
    p99Ms: num(data, 'p99Ms', path),
  }
}

function copyOptionalNumber(
  source: Record<string, unknown>,
  target: CoreReport,
  key: 'storeSizeAfter' | 'storeSizeAtBoundary' | 'storeSizeAfterTraffic' | 'storeSizeAfterWindowAdvanceAndSweep',
): void {
  if (source[key] === undefined) return
  target[key] = num(source, key, 'core')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  return value
}

function arrayOf(data: Record<string, unknown>, key: string, path: string): unknown[] {
  const value = data[key]
  if (!Array.isArray(value)) throw new Error(`${path}.${key} must be an array`)
  return value
}

function str(data: Record<string, unknown>, key: string, path: string): string {
  const value = data[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string`)
  }
  return value
}

function num(data: Record<string, unknown>, key: string, path: string): number {
  const value = data[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path}.${key} must be a finite number`)
  }
  return value
}

function numOrNull(data: Record<string, unknown>, key: string, path: string): number | null {
  const value = data[key]
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path}.${key} must be a finite number or null`)
  }
  return value
}

function bool(data: Record<string, unknown>, key: string, path: string): boolean {
  const value = data[key]
  if (typeof value !== 'boolean') throw new Error(`${path}.${key} must be a boolean`)
  return value
}

function numList(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value.map((entry, index) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new Error(`${path}[${index}] must be a finite number`)
    }
    return entry
  })
}
