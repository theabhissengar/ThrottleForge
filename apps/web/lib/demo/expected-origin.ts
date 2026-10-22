const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1'])

export function resolveExpectedOrigin(input: {
  nodeEnv: string | undefined
  canonical: string | undefined
  requestUrl: string
}): { ok: true; origin: string } | { ok: false } {
  if (input.canonical !== undefined) {
    const origin = exactHttpOrigin(input.canonical)
    return origin === null ? { ok: false } : { ok: true, origin }
  }
  if (input.nodeEnv === 'production') return { ok: false }
  let url: URL
  try {
    url = new URL(input.requestUrl)
  } catch {
    return { ok: false }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false }
  if (!LOOPBACK.has(url.hostname)) return { ok: false }
  return { ok: true, origin: url.origin }
}

export function originAllowed(
  expected: string,
  originHeader: string | null,
  secFetchSite: string | null,
): boolean {
  if (secFetchSite !== null && secFetchSite !== 'same-origin') return false
  if (originHeader === null) return false
  let url: URL
  try {
    url = new URL(originHeader)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return url.origin === expected
}

function exactHttpOrigin(value: string): string | null {
  if (value.length === 0) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username !== '' || url.password !== '') return null
  if (url.search !== '' || url.hash !== '') return null
  if (url.pathname !== '/' && url.pathname !== '') return null
  if (url.origin !== value) return null
  return url.origin
}
