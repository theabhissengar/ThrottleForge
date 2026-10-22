/**
 * Development and test run the probe unless it is explicitly disabled.
 * Production runs it only for the exact value `enabled`.
 * Any other value, including an empty string, leaves the probe off.
 */
export function probeEnabled(nodeEnv: string | undefined, flag: string | undefined): boolean {
  if (flag === 'disabled') return false
  if (nodeEnv === 'production') return flag === 'enabled'
  return flag === undefined || flag === 'enabled'
}

export function isExactDemoBody(body: unknown): boolean {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false
  const record = body as Record<string, unknown>
  const keys = Object.keys(record)
  return keys.length === 1 && keys[0] === 'count' && record.count === 10
}
