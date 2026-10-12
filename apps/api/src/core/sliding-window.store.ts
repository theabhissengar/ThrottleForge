import { ClientId } from './identity';
import { DEFAULT_PURGE_MAX_INSPECT } from './in-memory.store';

export interface SlidingWindowRecord {
  prevWindowStart: number;
  prevCount: number;
  currWindowStart: number;
  currCount: number;
}

export interface SlidingWindowConsumeResult {
  allowed: boolean;
  /** Pre-request estimate used for the allow/reject decision. */
  estimate: number;
  prevCount: number;
  currCount: number;
  currWindowStart: number;
}

/**
 * Process-local store for weighted sliding-window counters.
 * Purges when currWindowStart is older than the previous calendar window.
 */
export class SlidingWindowStore {
  private readonly records = new Map<ClientId, SlidingWindowRecord>();
  private sweepIterator: Iterator<[ClientId, SlidingWindowRecord]> | null =
    null;

  tryConsume(
    key: ClientId,
    now: number,
    windowMs: number,
    limit: number,
  ): SlidingWindowConsumeResult {
    const C = Math.floor(now / windowMs) * windowMs;
    const elapsed = now - C;
    const weight = 1 - elapsed / windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = {
        prevWindowStart: C - windowMs,
        prevCount: 0,
        currWindowStart: C,
        currCount: 0,
      };
    } else if (record.currWindowStart === C) {
      // keep
    } else if (record.currWindowStart === C - windowMs) {
      record = {
        prevWindowStart: record.currWindowStart,
        prevCount: record.currCount,
        currWindowStart: C,
        currCount: 0,
      };
    } else {
      record = {
        prevWindowStart: C - windowMs,
        prevCount: 0,
        currWindowStart: C,
        currCount: 0,
      };
    }

    const estimate = record.prevCount * weight + record.currCount;

    let result: SlidingWindowConsumeResult;
    if (estimate >= limit) {
      this.records.set(key, record);
      result = {
        allowed: false,
        estimate,
        prevCount: record.prevCount,
        currCount: record.currCount,
        currWindowStart: record.currWindowStart,
      };
    } else {
      record = {
        ...record,
        currCount: record.currCount + 1,
      };
      this.records.set(key, record);
      result = {
        allowed: true,
        estimate,
        prevCount: record.prevCount,
        currCount: record.currCount,
        currWindowStart: record.currWindowStart,
      };
    }

    this.purgeStale(now, windowMs, DEFAULT_PURGE_MAX_INSPECT);
    return result;
  }

  /**
   * Delete records whose currWindowStart is older than C - windowMs.
   * Inspection-count bound; no mid-call iterator restart.
   */
  purgeStale(
    now: number,
    windowMs: number,
    maxInspect: number,
  ): { inspected: number; deleted: number } {
    if (!Number.isInteger(maxInspect) || maxInspect < 1) {
      return { inspected: 0, deleted: 0 };
    }

    if (this.records.size === 0) {
      this.sweepIterator = null;
      return { inspected: 0, deleted: 0 };
    }

    const C = Math.floor(now / windowMs) * windowMs;
    const staleBefore = C - windowMs;

    if (!this.sweepIterator) {
      this.sweepIterator = this.records.entries();
    }

    let inspected = 0;
    let deleted = 0;

    while (inspected < maxInspect) {
      const next = this.sweepIterator.next();
      if (next.done) {
        this.sweepIterator = null;
        break;
      }

      inspected += 1;
      const [key, record] = next.value;
      if (record.currWindowStart < staleBefore) {
        this.records.delete(key);
        deleted += 1;
      }
    }

    return { inspected, deleted };
  }

  getRecord(key: ClientId): SlidingWindowRecord | undefined {
    return this.records.get(key);
  }

  /** Test helper: seed state without consume. */
  setRecord(key: ClientId, record: SlidingWindowRecord): void {
    this.records.set(key, { ...record });
  }

  size(): number {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
    this.sweepIterator = null;
  }
}
