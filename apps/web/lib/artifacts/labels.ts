export const DOCUMENTED_MEANS = {
  adaptive: '0.21637605042016808',
  'static-floor': '0.456281512605042',
  'static-ceiling': '0.34344537815126047',
  'static-oracle': '0.05',
} as const

export const DOCUMENTED_REGRET = {
  steady: { adaptive: 6, 'static-floor': 24, 'static-ceiling': 0, 'static-oracle': 0 },
  burst: { adaptive: 10, 'static-floor': 28, 'static-ceiling': 24, 'static-oracle': 0 },
  'sustained-overload': { adaptive: 28, 'static-floor': 56, 'static-ceiling': 192, 'static-oracle': 0 },
  recovery: { adaptive: 18, 'static-floor': 36, 'static-ceiling': 72, 'static-oracle': 0 },
  'capacity-change': { adaptive: 102, 'static-floor': 132, 'static-ceiling': 48, 'static-oracle': 48 },
} as const

/** Four decimal places for display. The numeric mean is left unchanged. */
export function formatMean(value: number): string {
  return value.toFixed(4)
}

export const SCENARIO_INTENTS: Record<string, string> = {
  'sustained-under': 'About 0.5× limit, spread evenly through one window.',
  'sustained-over': 'About 2× limit, spread evenly.',
  'boundary-burst': 'A full limit at the end of a window and again at the start of the next.',
  'sw-decay': 'Fill the window, cross the boundary, then probe mid-window eligibility.',
  'tb-idle-burst': 'Drain the bucket, wait about one window, then burst again.',
  'many-clients': 'Distinct clients, so each algorithm keeps its own state size.',
}

export const COMPARE_SCENARIOS = [
  'boundary-burst',
  'sustained-under',
  'sustained-over',
  'sw-decay',
  'tb-idle-burst',
  'many-clients',
] as const

export function algorithmLabel(id: string): string {
  if (id === 'fixed') return 'Fixed window'
  if (id === 'sliding') return 'Weighted sliding-window counter'
  if (id === 'token-bucket') return 'Token bucket'
  return id
}

export function runnerLabel(id: string): string {
  if (id === 'adaptive') return 'Adaptive'
  if (id === 'static-floor') return 'Static floor'
  if (id === 'static-ceiling') return 'Static ceiling'
  if (id === 'static-oracle') return 'Static oracle'
  if (id === 'per-client-fixed-window-reference') return 'Per-client reference'
  return id
}

export function runnerColor(id: string): string {
  if (id === "adaptive") return "accent";
  if (id === "static-floor") return "floor";
  if (id === "static-ceiling") return "ceiling";
  if (id === "static-oracle") return "oracle";
  return "muted";
}
