export type LatencySummary = {
  p50Ms: number
  p95Ms: number
  p99Ms: number
}

export type TimingBlock = {
  elapsedMs: number
  throughputRps: number | null
  latency: LatencySummary
}

export type CompareResult = {
  algorithm: string
  correctness: {
    allowed: number
    rejected: number
    unexpectedErrors: number
    storeSizeAfter: number
  }
  observational: TimingBlock
}

export type CompareReport = {
  mode: 'compare'
  scenario: string
  limit: number
  windowMs: number
  traceLength: number
  results: CompareResult[]
}

export type CoreReport = {
  mode: 'core'
  algorithm: string
  pattern: string
  requests: number
  concurrency: number
  limit: number
  windowMs: number
  allowed: number
  rejected: number
  errors: number
  elapsedMs: number
  throughputRps: number | null
  latency: LatencySummary
  storeSizeBefore: number
  storeSizeAfter?: number
  storeSizeAtBoundary?: number
  storeSizeAfterTraffic?: number
  storeSizeAfterWindowAdvanceAndSweep?: number
}

export type HttpReport = {
  mode: 'http'
  baseUrl: string
  path: string
  pattern: string
  requests: number
  concurrency: number
  success: number
  expectedRateLimited: number
  unexpectedStatus: number
  transportErrors: number
  elapsedMs: number
  throughputRps: number | null
  latency: LatencySummary
  observationalMetrics: Record<string, number | string | null>
}

export type RedisMismatch = {
  index: number
  memory: { allowed: boolean; remaining: number; resetAt: number }
  redis: { allowed: boolean; remaining: number; resetAt: number }
}

export type RedisReport = {
  mode: 'redis-compare'
  scenario: string
  limit: number
  windowMs: number
  traceLength: number
  correctness: {
    matched: boolean
    mismatches: RedisMismatch[]
  }
  observational: {
    memory: TimingBlock
    redis: TimingBlock
  }
}

export type AdaptiveRunner = {
  runner: string
  usesController: boolean
  offered: number
  admitted: number
  rejected: number
  shortfall: number
  excess: number
  regret: number
  normalizedRegret: number
  limitsInForce: number[]
  offeredByWindow: number[]
  admittedByWindow: number[]
  limitAfterUpdate?: number[]
  outcomes: { increase: number; decrease: number; hold: number }
  perClientAdmitted: Record<string, number>
}

export type AdaptiveScenario = {
  scenario: string
  inPassSet: boolean
  initialCapacity: number
  traceLength: number
  runners: AdaptiveRunner[]
}

export type AdaptiveReport = {
  mode: 'adaptive-compare'
  parameters: {
    floor: number
    initial: number
    ceiling: number
    windowMs: number
    base: number
    perClientReferenceLimit: number
    globalKey: string
  }
  correctness: {
    scenarios: AdaptiveScenario[]
    means: {
      adaptive: number
      'static-floor': number
      'static-ceiling': number
      'static-oracle': number
    }
    comparisons: {
      adaptiveBeatsStaticFloor: boolean
      adaptiveBeatsStaticCeiling: boolean
      passed: boolean
    }
    conclusion: string
  }
  observational: {
    elapsedMs: number
  }
}

export type ArtifactReport = CompareReport | CoreReport | HttpReport | RedisReport | AdaptiveReport

export type ArtifactMetadata = {
  label: string
  value: string
}
