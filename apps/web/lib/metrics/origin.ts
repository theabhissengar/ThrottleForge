export type LiveTargets = {
  health: string
  metrics: string
}

/**
 * The scrape target comes only from the server environment.
 * `requestUrl` is accepted so the route can pass the incoming request
 * and tests can prove query parameters do not select a host.
 */
export function liveTargets(envValue: string | undefined, requestUrl: string): LiveTargets {
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
  const origin = url.origin
  return {
    health: `${origin}/health`,
    metrics: `${origin}/metrics`,
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
