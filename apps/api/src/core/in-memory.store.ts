import { ClientId } from './identity';
import { SyncRateLimitStore, WindowRecord } from './store';

/**
 * Process-local Map store. Does not coordinate across processes.
 * Memory grows with distinct keys (documented M1 limitation).
 */
export class InMemoryStore implements SyncRateLimitStore {
  private readonly records = new Map<ClientId, WindowRecord>();

  tryConsume(
    key: ClientId,
    windowStart: number,
    limit: number,
  ): { allowed: boolean; count: number } {
    const existing = this.records.get(key);
    let count =
      existing && existing.windowStart === windowStart ? existing.count : 0;

    if (count >= limit) {
      return { allowed: false, count };
    }

    count += 1;
    this.records.set(key, { windowStart, count });
    return { allowed: true, count };
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
  }
}
