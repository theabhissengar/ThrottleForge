/**
 * Fixed-size in-flight promise pool. At most `concurrency` tasks run at once.
 */
export async function runPool<T>(
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(total);
  let next = 0;

  async function runOne(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= total) {
        return;
      }
      results[index] = await worker(index);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, total) },
    () => runOne(),
  );
  await Promise.all(runners);
  return results;
}

export function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) {
    return 0;
  }
  const rank = Math.min(
    sortedMs.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedMs.length) - 1),
  );
  return sortedMs[rank];
}

export function summarizeLatencies(samplesNs: bigint[]): {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
} {
  const ms = samplesNs
    .map((ns) => Number(ns) / 1e6)
    .sort((a, b) => a - b);
  return {
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95),
    p99Ms: percentile(ms, 99),
  };
}
