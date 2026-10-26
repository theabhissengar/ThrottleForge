import { describe, expect, it } from 'vitest'
import { DOCUMENTED_MEANS, formatMean } from './labels'

describe('formatMean', () => {
  it('shows the documented pass-set means to four decimal places', () => {
    expect(formatMean(Number(DOCUMENTED_MEANS.adaptive))).toBe('0.2164')
    expect(formatMean(Number(DOCUMENTED_MEANS['static-floor']))).toBe('0.4563')
    expect(formatMean(Number(DOCUMENTED_MEANS['static-ceiling']))).toBe('0.3434')
    expect(formatMean(Number(DOCUMENTED_MEANS['static-oracle']))).toBe('0.0500')
  })

  it('leaves the documented reference strings at full precision', () => {
    expect(DOCUMENTED_MEANS).toEqual({
      adaptive: '0.21637605042016808',
      'static-floor': '0.456281512605042',
      'static-ceiling': '0.34344537815126047',
      'static-oracle': '0.05',
    })
  })

  it('formats zero, a short decimal, and a longer value', () => {
    const zero = 0
    const short = 0.05
    const long = 0.21637605042016808

    expect(formatMean(zero)).toBe('0.0000')
    expect(formatMean(short)).toBe('0.0500')
    expect(formatMean(long)).toBe('0.2164')
    expect(formatMean(0.34344537815126047)).toBe('0.3434')
    expect(zero).toBe(0)
    expect(short).toBe(0.05)
    expect(long).toBe(0.21637605042016808)
  })
})
