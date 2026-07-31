/**
 * Tiny in-process TTL cache for hot GET responses.
 * Cleared explicitly on writes; also expires by TTL.
 */
class MemoryCache {
  constructor() {
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    const ttl = Math.max(0, Number(ttlMs) || 0);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  deletePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }
}

const cache = new MemoryCache();

const TTL = {
  records: 8_000,
  vendors: 60_000,
  invoiceOptions: 60_000,
};

function recordsCacheKey() {
  return "records:all";
}

function adminRecordsCacheKey(role, includeFinished) {
  return `records:admin:${role}:${includeFinished ? "1" : "0"}`;
}

function invalidateRecordsCache() {
  cache.delete(recordsCacheKey());
  cache.deletePrefix("records:admin:");
}

function invalidateVendorsCache() {
  cache.delete("vendors:all");
}

function invalidateInvoiceOptionsCache() {
  cache.deletePrefix("invoice-options:");
}

module.exports = {
  cache,
  TTL,
  recordsCacheKey,
  adminRecordsCacheKey,
  invalidateRecordsCache,
  invalidateVendorsCache,
  invalidateInvoiceOptionsCache,
};
