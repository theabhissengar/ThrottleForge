const FIXED_PATHS = {
  health: '/health',
  metrics: '/metrics',
  demo: '/api/demo',
  policy: '/api/rate-limit/policy',
} as const

export type ApiPathName = keyof typeof FIXED_PATHS

export type LiveTargets = {
  health: string
  metrics: string
}

/**
 * The API origin comes only from the server environment.
 * `requestUrl` is accepted so callers can pass the incoming request
 * and tests can prove query parameters do not select a host.
 */
export function apiUrl(envValue: string | undefined, requestUrl: string, path: ApiPathName): string {
  ignoreRequestOriginOverride(requestUrl)
  const raw = envValue?.trim() || 'http://127.0.0.1:3000'
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('THROTTLEFORGE_API_ORIGIN is not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('THROTTLEFORGE_API_ORIGIN must use http or https')
  }
  return `${url.origin}${FIXED_PATHS[path]}`
}

export function liveTargets(envValue: string | undefined, requestUrl: string): LiveTargets {
  return {
    health: apiUrl(envValue, requestUrl, 'health'),
    metrics: apiUrl(envValue, requestUrl, 'metrics'),
  }
}

function ignoreRequestOriginOverride(requestUrl: string): void {
  let request: URL
  try {
    request = new URL(requestUrl)
  } catch {
    return
  }
  request.searchParams.get('url')
  request.searchParams.get('origin')
}
