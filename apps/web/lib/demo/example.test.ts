import { describe, expect, it } from 'vitest'
import { exampleFixedWindowRows } from './example'

describe('exampleFixedWindowRows', () => {
  it('illustrates the configured limit and one rejection', () => {
    const rows = exampleFixedWindowRows(5)
    expect(rows).toHaveLength(6)
    expect(rows?.[0]).toEqual({
      sequence: 1,
      statusLabel: 'Example 200',
      limit: '5',
      remaining: '4',
      meaning: 'Example of an allow under this limit.',
    })
    expect(rows?.[4]?.remaining).toBe('0')
    expect(rows?.[5]).toEqual({
      sequence: 6,
      statusLabel: 'Example 429',
      limit: '5',
      remaining: '0',
      meaning: 'Example of a rejection after this limit.',
    })
  })

  it('does not invent rows for a missing limit', () => {
    expect(exampleFixedWindowRows(0)).toBeNull()
    expect(exampleFixedWindowRows(1.5)).toBeNull()
  })
})
