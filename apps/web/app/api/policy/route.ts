import { connection } from 'next/server'
import { parsePolicyText } from '@/lib/demo/policy'
import { apiUrl } from '@/lib/metrics/origin'
import { FETCH_TIMEOUT_MS, HEALTH_BYTE_CAP, readCapped } from '@/lib/metrics/read-capped'

export async function GET(request: Request) {
  await connection()
  try {
    const url = apiUrl(process.env.THROTTLEFORGE_API_ORIGIN, request.url, 'policy')
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const text = await readCapped(response, HEALTH_BYTE_CAP)
    if (!response.ok) {
      return Response.json({ state: 'unavailable' })
    }
    return Response.json(parsePolicyText(text))
  } catch {
    return Response.json({ state: 'unavailable' })
  }
}
