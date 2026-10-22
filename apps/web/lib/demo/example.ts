export type ExampleOutcomeRow = {
  sequence: number
  statusLabel: 'Example 200' | 'Example 429'
  limit: string
  remaining: string
  meaning: string
}

/** Illustration only. These rows are not HTTP responses and do not touch the API. */
export function exampleFixedWindowRows(limit: number): ExampleOutcomeRow[] | null {
  if (!Number.isInteger(limit) || limit < 1) return null
  const rows: ExampleOutcomeRow[] = []
  for (let sequence = 1; sequence <= limit; sequence += 1) {
    rows.push({
      sequence,
      statusLabel: 'Example 200',
      limit: String(limit),
      remaining: String(limit - sequence),
      meaning: 'Example of an allow under this limit.',
    })
  }
  rows.push({
    sequence: limit + 1,
    statusLabel: 'Example 429',
    limit: String(limit),
    remaining: '0',
    meaning: 'Example of a rejection after this limit.',
  })
  return rows
}
