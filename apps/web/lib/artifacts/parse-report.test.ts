import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COMPARE_SCENARIOS, DOCUMENTED_MEANS, DOCUMENTED_REGRET } from './labels'
import { parseArtifact } from './parse-report'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content')

describe('parseArtifact', () => {
  it('rejects text that is not JSON', () => {
    const parsed = parseArtifact('not-json')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toMatch(/not valid JSON/)
  })

  it('rejects an object without mode', () => {
    const parsed = parseArtifact('{"scenario":"boundary-burst"}')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toMatch(/missing mode/)
  })

  it('rejects an unknown mode', () => {
    const parsed = parseArtifact('{"mode":"shell"}')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toMatch(/Unknown mode/)
  })

  it('rejects a compare file that omits correctness', () => {
    const result = parseArtifact(
      JSON.stringify({
        mode: 'compare',
        scenario: 'boundary-burst',
        limit: 10,
        windowMs: 1000,
        traceLength: 1,
        results: [{ algorithm: 'fixed' }],
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('accepts each committed compare scenario', () => {
    for (const scenario of COMPARE_SCENARIOS) {
      const text = readFileSync(join(root, 'compare', `${scenario}.json`), 'utf8')
      const parsed = parseArtifact(text)
      expect(parsed.ok, scenario).toBe(true)
      if (!parsed.ok) continue
      expect(parsed.report.mode).toBe('compare')
      if (parsed.report.mode !== 'compare') continue
      expect(parsed.report.scenario).toBe(scenario)
      expect(parsed.report.limit).toBe(10)
      expect(parsed.report.windowMs).toBe(1000)
      expect(parsed.report.results.map((result) => result.algorithm)).toEqual([
        'fixed',
        'sliding',
        'token-bucket',
      ])
    }
  })
})

describe('adaptive reference', () => {
  it('matches the documented means and pass-set regrets', () => {
    const text = readFileSync(join(root, 'adaptive-compare.json'), 'utf8')
    const parsed = parseArtifact(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok || parsed.report.mode !== 'adaptive-compare') return
    const { means, scenarios, conclusion } = parsed.report.correctness
    expect(conclusion).toBe('passed')
    expect(String(means.adaptive)).toBe(DOCUMENTED_MEANS.adaptive)
    expect(means.adaptive).toBe(Number(DOCUMENTED_MEANS.adaptive))
    expect(means['static-floor']).toBe(Number(DOCUMENTED_MEANS['static-floor']))
    expect(means['static-ceiling']).toBe(Number(DOCUMENTED_MEANS['static-ceiling']))
    expect(means['static-oracle']).toBe(Number(DOCUMENTED_MEANS['static-oracle']))
    for (const [scenario, regrets] of Object.entries(DOCUMENTED_REGRET)) {
      const found = scenarios.find((entry) => entry.scenario === scenario)
      expect(found?.inPassSet).toBe(true)
      for (const [runner, regret] of Object.entries(regrets)) {
        expect(found?.runners.find((entry) => entry.runner === runner)?.regret).toBe(regret)
      }
    }
    const mixed = scenarios.find((entry) => entry.scenario === 'mixed')
    expect(mixed?.inPassSet).toBe(false)
  })
})
