export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatSeconds(value: number): string {
  if (!Number.isFinite(value)) return 'Unavailable'
  if (Object.is(value, -0) || value === 0) return '0 s'
  const absolute = Math.abs(value)
  if (absolute < 0.0000001) return `${value.toExponential(2)} s`
  const text = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return `${text} s`
}

export function presenceNote(presence: 'reported' | 'absent', value: number): string {
  if (presence === 'absent') return 'No sample in this scrape'
  if (value === 0) return 'Reported 0'
  return 'Cumulative counter'
}

export type CountPresence = 'reported' | 'absent'

/** Absent decision counters are not a confirmed zero. A zero notice requires both series to be reported as 0. */
export function decisionNotice(
  allowed: { presence: CountPresence; value: number },
  rejected: { presence: CountPresence; value: number },
): 'absent' | 'reported-zero' | null {
  if (allowed.presence === 'absent' && rejected.presence === 'absent') return 'absent'
  if (
    allowed.presence === 'reported' &&
    rejected.presence === 'reported' &&
    allowed.value === 0 &&
    rejected.value === 0
  ) {
    return 'reported-zero'
  }
  return null
}

export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000))
  if (seconds === 1) return '1 second ago'
  return `${seconds} seconds ago`
}
