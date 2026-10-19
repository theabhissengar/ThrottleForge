import boundaryBurst from '../../content/compare/boundary-burst.json'
import manyClients from '../../content/compare/many-clients.json'
import sustainedOver from '../../content/compare/sustained-over.json'
import sustainedUnder from '../../content/compare/sustained-under.json'
import swDecay from '../../content/compare/sw-decay.json'
import tbIdleBurst from '../../content/compare/tb-idle-burst.json'
import adaptiveCompare from '../../content/adaptive-compare.json'
import { COMPARE_SCENARIOS } from './labels'
import { parseArtifact } from './parse-report'
import type { AdaptiveReport, CompareReport } from './types'

const compareFiles: Record<(typeof COMPARE_SCENARIOS)[number], unknown> = {
  'boundary-burst': boundaryBurst,
  'sustained-under': sustainedUnder,
  'sustained-over': sustainedOver,
  'sw-decay': swDecay,
  'tb-idle-burst': tbIdleBurst,
  'many-clients': manyClients,
}

export function compareReference(scenario: (typeof COMPARE_SCENARIOS)[number]): CompareReport {
  const parsed = parseArtifact(JSON.stringify(compareFiles[scenario]))
  if (!parsed.ok || parsed.report.mode !== 'compare') {
    throw new Error(`Committed reference ${scenario} is not a compare transcript`)
  }
  return parsed.report
}

export function adaptiveReference(): AdaptiveReport {
  const parsed = parseArtifact(JSON.stringify(adaptiveCompare))
  if (!parsed.ok || parsed.report.mode !== 'adaptive-compare') {
    throw new Error('Committed adaptive transcript is invalid')
  }
  return parsed.report
}
