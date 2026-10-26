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

export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000))
  if (seconds === 1) return '1 second ago'
  return `${seconds} seconds ago`
}
