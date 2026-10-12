import { ClientId } from './identity';
import { DEFAULT_PURGE_MAX_INSPECT } from './in-memory.store';

export interface TokenBucketRecord {
  tokens: number;
  lastRefillAt: number;
}

export interface TokenBucketConsumeResult {
  allowed: boolean;
  /** Token balance after refill and optional consume. */
  tokens: number;
  lastRefillAt: number;
}

/**
 * Process-local token-bucket store.
 * Purges when virtual refill would already reach capacity (recreate-equivalent).
 */
export class TokenBucketStore {
  private readonly records = new Map<ClientId, TokenBucketRecord>();
  private sweepIterator: Iterator<[ClientId, TokenBucketRecord]> | null =
    null;

  tryConsume(
    key: ClientId,
    now: number,
    capacity: number,
    refillPerMs: number,
  ): TokenBucketConsumeResult {
    let record = this.records.get(key);
    if (!record) {
      record = { tokens: capacity, lastRefillAt: now };
    } else {
      const elapsed = Math.max(0, now - record.lastRefillAt);
      const tokens = Math.min(
        capacity,
        record.tokens + elapsed * refillPerMs,
      );
      record = { tokens, lastRefillAt: now };
    }

    let result: TokenBucketConsumeResult;
    if (record.tokens >= 1) {
      record = {
        tokens: record.tokens - 1,
        lastRefillAt: record.lastRefillAt,
      };
      this.records.set(key, record);
      result = {
        allowed: true,
        tokens: record.tokens,
        lastRefillAt: record.lastRefillAt,
      };
    } else {
      this.records.set(key, record);
      result = {
        allowed: false,
        tokens: record.tokens,
        lastRefillAt: record.lastRefillAt,
      };
    }

    this.purgeStale(now, capacity, refillPerMs, DEFAULT_PURGE_MAX_INSPECT);
    return result;
  }

  /**
   * Delete when virtualTokens >= capacity (missing key ≡ full bucket).
   */
  purgeStale(
    now: number,
    capacity: number,
    refillPerMs: number,
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
        this.sweepIterator = null;
        break;
      }

      inspected += 1;
      const [key, record] = next.value;
      const elapsed = Math.max(0, now - record.lastRefillAt);
      const virtualTokens = Math.min(
        capacity,
        record.tokens + elapsed * refillPerMs,
      );
      if (virtualTokens >= capacity) {
        this.records.delete(key);
        deleted += 1;
      }
    }

    return { inspected, deleted };
  }

  getRecord(key: ClientId): TokenBucketRecord | undefined {
    return this.records.get(key);
  }

  /** Test helper: seed state without consume. */
  setRecord(key: ClientId, record: TokenBucketRecord): void {
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
