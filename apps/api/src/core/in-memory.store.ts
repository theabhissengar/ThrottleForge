import { ClientId } from './identity';
import { SyncRateLimitStore, WindowRecord } from './store';

/** Default inspection budget when sweeping from tryConsume. */
export const DEFAULT_PURGE_MAX_INSPECT = 16;

/**
 * Process-local Map store. Does not coordinate across processes.
 * Stale entries (windowStart < current window) are removed opportunistically
 * via {@link InMemoryStore.purgeStale} with a bounded inspection count.
 */
export class InMemoryStore implements SyncRateLimitStore {
  private readonly records = new Map<ClientId, WindowRecord>();
  /** Resumed across purgeStale calls; null means start a new pass next time. */
  private sweepIterator: Iterator<[ClientId, WindowRecord]> | null = null;

  tryConsume(
    key: ClientId,
    windowStart: number,
    limit: number,
  ): { allowed: boolean; count: number } {
    const existing = this.records.get(key);
    let count =
      existing && existing.windowStart === windowStart ? existing.count : 0;

    let result: { allowed: boolean; count: number };
    if (count >= limit) {
      result = { allowed: false, count };
    } else {
      count += 1;
      this.records.set(key, { windowStart, count });
      result = { allowed: true, count };
    }

    this.purgeStale(windowStart, DEFAULT_PURGE_MAX_INSPECT);
    return result;
  }

  /**
   * Examine up to `maxInspect` Map entries and delete those with
   * `windowStart < currentWindowStart`. Does not restart the iterator mid-call.
   * Operation-count bound only — not a wall-clock guarantee.
   */
  purgeStale(
    currentWindowStart: number,
    maxInspect: number,
  ): { inspected: number; deleted: number } {
    if (!Number.isInteger(maxInspect) || maxInspect < 1) {
      return { inspected: 0, deleted: 0 };
    }

    if (this.records.size === 0) {
      this.sweepIterator = null;
      return { inspected: 0, deleted: 0 };
    }

    if (!this.sweepIterator) {
      this.sweepIterator = this.records.entries();
    }

    let inspected = 0;
    let deleted = 0;

    while (inspected < maxInspect) {
      const next = this.sweepIterator.next();
      if (next.done) {
        // End this invocation; next purgeStale starts a fresh pass.
        this.sweepIterator = null;
        break;
      }

      inspected += 1;
      const [key, record] = next.value;
      if (record.windowStart < currentWindowStart) {
        this.records.delete(key);
        deleted += 1;
      }
    }

    return { inspected, deleted };
  }

  /** Test/introspection helper — not part of the consume critical path. */
  getRecord(key: ClientId): WindowRecord | undefined {
    return this.records.get(key);
  }

  size(): number {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
    this.sweepIterator = null;
  }
}
