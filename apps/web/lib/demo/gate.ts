export type ProbeAcquire =
  | { ok: true }
  | { ok: false; error: 'batch_in_progress' }
  | { ok: false; error: 'cooldown'; retryAfterSec: number }

export function createProbeGate(now: () => number, cooldownMs: number) {
  let inFlight = false
  let cooldownUntil = 0

  return {
    tryAcquire(): ProbeAcquire {
      if (inFlight) return { ok: false, error: 'batch_in_progress' }
      const time = now()
      if (time < cooldownUntil) {
        return {
          ok: false,
          error: 'cooldown',
          retryAfterSec: Math.max(1, Math.ceil((cooldownUntil - time) / 1000)),
        }
      }
      inFlight = true
      return { ok: true }
    },
    release(): void {
      inFlight = false
      cooldownUntil = now() + cooldownMs
    },
  }
}
