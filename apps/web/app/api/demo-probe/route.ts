import { connection } from 'next/server'
import {
  DEMO_BATCH_DEADLINE_MS,
  DEMO_COOLDOWN_MS,
  DEMO_REQUEST_TIMEOUT_MS,
} from '@/lib/demo/constants'
import { createDemoProbeHandler } from '@/lib/demo/handler'

const HANDLER_KEY = Symbol.for('throttleforge.demoProbeHandler')

type DemoProbeHandler = (request: Request) => Promise<Response>

function demoProbeHandler(): DemoProbeHandler {
  const store = globalThis as typeof globalThis & { [HANDLER_KEY]?: DemoProbeHandler }
  if (!store[HANDLER_KEY]) {
    store[HANDLER_KEY] = createDemoProbeHandler({
      now: () => Date.now(),
      fetchImpl: fetch,
      timeoutMs: DEMO_REQUEST_TIMEOUT_MS,
      deadlineMs: DEMO_BATCH_DEADLINE_MS,
      cooldownMs: DEMO_COOLDOWN_MS,
      env: {
        get NODE_ENV() {
          return process.env.NODE_ENV
        },
        get THROTTLEFORGE_DEMO_PROBE() {
          return process.env.THROTTLEFORGE_DEMO_PROBE
        },
        get THROTTLEFORGE_CANONICAL_ORIGIN() {
          return process.env.THROTTLEFORGE_CANONICAL_ORIGIN
        },
        get THROTTLEFORGE_API_ORIGIN() {
          return process.env.THROTTLEFORGE_API_ORIGIN
        },
      },
    })
  }
  return store[HANDLER_KEY]
}

export async function POST(request: Request) {
  await connection()
  return demoProbeHandler()(request)
}
