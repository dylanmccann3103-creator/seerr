import { LRUCache } from 'lru-cache';

export type AvailableCacheIds = 'tpdb' | 'whisparr';

const DEFAULT_TTL = 300;

const OBJECT_VALUE_SIZE = 80;
const PROMISE_VALUE_SIZE = 80;
const ARRAY_VALUE_SIZE = 40;

// One key per scene/site/performer lookup or search page.
const TPDB_MAX_KEYS = 1000;

// Rolling quality profile / root folder lookups, a few keys per server.
const WHISPARR_MAX_KEYS = 64;

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  ksize: number;
  vsize: number;
}

export interface CacheStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl?: number): boolean;
  del(key: string): number;
  getTtl(key: string): number | undefined;
  getStats(): CacheStats;
  flushAll(): void;
}

const keyLength = (key: string): number => key.toString().length;

const valueLength = (value: unknown): number => {
  if (typeof value === 'string') {
    return value.length;
  }
  if (Array.isArray(value)) {
    return ARRAY_VALUE_SIZE * value.length;
  }
  if (typeof value === 'number') {
    return 8;
  }
  if (
    typeof (value as { then?: unknown } | null | undefined)?.then === 'function'
  ) {
    return PROMISE_VALUE_SIZE;
  }
  if (Buffer.isBuffer(value)) {
    return value.length;
  }
  if (value != null && typeof value === 'object') {
    return OBJECT_VALUE_SIZE * Object.keys(value).length;
  }
  if (typeof value === 'boolean') {
    return 8;
  }
  return 0;
};

interface LruEntry {
  value: unknown;
  ksize: number;
  vsize: number;
}

class LruCacheStore implements CacheStore {
  private cache: LRUCache<string, LruEntry>;
  private stdTtl: number;
  private hits = 0;
  private misses = 0;
  private ksize = 0;
  private vsize = 0;

  constructor({ max, stdTtl }: { max: number; stdTtl: number }) {
    this.stdTtl = stdTtl;
    this.cache = new LRUCache<string, LruEntry>({
      max,
      ttl: stdTtl * 1000,
      // Without this, expired entries are only dropped when their key is read.
      ttlAutopurge: true,
      // Fires on every removal path, so one decrement here covers all of them.
      dispose: (entry) => {
        this.ksize -= entry.ksize;
        this.vsize -= entry.vsize;
      },
    });
  }

  // Cloned on read because callers mutate what they get back.
  public get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (entry === undefined) {
      this.misses++;
      return undefined;
    }

    this.hits++;
    return structuredClone(entry.value) as T;
  }

  public set<T>(key: string, value: T, ttl?: number): boolean {
    const entry: LruEntry = {
      value: structuredClone(value),
      ksize: keyLength(key),
      vsize: valueLength(value),
    };

    // A ttl of 0 means the entry never expires.
    this.cache.set(key, entry, { ttl: (ttl ?? this.stdTtl) * 1000 });

    this.ksize += entry.ksize;
    this.vsize += entry.vsize;

    return true;
  }

  public del(key: string): number {
    return this.cache.delete(key) ? 1 : 0;
  }

  public getTtl(key: string): number | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const remaining = this.cache.getRemainingTTL(key);

    // Keys with no expiry report 0.
    return remaining === Infinity ? 0 : Date.now() + remaining;
  }

  public getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      keys: this.cache.size,
      ksize: this.ksize,
      vsize: this.vsize,
    };
  }

  public flushAll(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.ksize = 0;
    this.vsize = 0;
  }
}

class Cache {
  public id: AvailableCacheIds;
  public data: CacheStore;
  public name: string;

  constructor(
    id: AvailableCacheIds,
    name: string,
    options: { max: number; stdTtl?: number }
  ) {
    this.id = id;
    this.name = name;

    this.data = new LruCacheStore({
      max: options.max,
      stdTtl: options.stdTtl ?? DEFAULT_TTL,
    });
  }

  public getStats() {
    return this.data.getStats();
  }

  public flush(): void {
    this.data.flushAll();
  }
}

class CacheManager {
  private availableCaches: Record<AvailableCacheIds, Cache> = {
    tpdb: new Cache('tpdb', 'ThePornDB API', {
      stdTtl: 21600,
      max: TPDB_MAX_KEYS,
    }),
    whisparr: new Cache('whisparr', 'Whisparr API', {
      max: WHISPARR_MAX_KEYS,
    }),
  };

  public getCache(id: AvailableCacheIds): Cache {
    return this.availableCaches[id];
  }

  public getAllCaches(): Record<string, Cache> {
    return this.availableCaches;
  }
}

const cacheManager = new CacheManager();

export default cacheManager;
