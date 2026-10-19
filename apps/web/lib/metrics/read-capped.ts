export const FETCH_TIMEOUT_MS = 2000
export const METRICS_BYTE_CAP = 256 * 1024
export const HEALTH_BYTE_CAP = 16 * 1024

export async function readCapped(response: Response, cap: number): Promise<string> {
  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > cap) {
      throw new Error('response exceeded size cap')
    }
    return text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > cap) {
        await reader.cancel()
        throw new Error('response exceeded size cap')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}
