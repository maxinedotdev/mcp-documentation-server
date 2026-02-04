/**
 * Multi-Level Query Cache Implementation
 *
 * Provides two-tier caching with L1 in-memory cache and optional L2 Redis cache.
 * L1 provides sub-millisecond access for hot data.
 * L2 enables cross-process caching and persistence.
 */

import Redis from 'ioredis';
import { getLogger } from '../utils.js';

const logger = getLogger('QueryCache');

/**
 * L1 (in-memory) cache configuration
 */
export interface L1CacheConfig {
    /** Maximum number of entries in L1 cache */
    maxSize: number;
    /** Time-to-live in milliseconds */
    ttl: number;
}

/**
 * L2 (Redis) cache configuration
 */
export interface L2CacheConfig {
    /** Whether L2 cache is enabled */
    enabled: boolean;
    /** Redis host */
    host: string;
    /** Redis port */
    port: number;
    /** Redis password (optional) */
    password?: string;
    /** Redis database number */
    db: number;
    /** Time-to-live in milliseconds */
    ttl: number;
    /** Key prefix for cache entries */
    keyPrefix: string;
}

/**
 * Complete cache configuration
 */
export interface QueryCacheConfig {
    /** L1 cache configuration */
    l1: L1CacheConfig;
    /** L2 cache configuration */
    l2: L2CacheConfig;
}

/**
 * Cache entry in L1
 */
interface L1Entry<V> {
    /** Cached value */
    data: V;
    /** Expiration timestamp */
    expires: number;
    /** Creation timestamp */
    createdAt: number;
}

/**
 * Cache statistics
 */
export interface QueryCacheStats {
    /** L1 cache statistics */
    l1: {
        size: number;
        maxSize: number;
        hits: number;
        misses: number;
        hitRate: number;
        evictions: number;
    };
    /** L2 cache statistics */
    l2: {
        enabled: boolean;
        connected: boolean;
        hits: number;
        misses: number;
        hitRate: number;
    };
    /** Combined statistics */
    combined: {
        totalHits: number;
        totalMisses: number;
        overallHitRate: number;
    };
}

/**
 * Multi-level query cache
 *
 * Implements L1 (in-memory) and optional L2 (Redis) caching layers.
 * Query pattern: L1 -> L2 -> Database
 * On hit: L2 populates L1 for faster subsequent access
 */
export class QueryCache {
    private l1Cache: Map<string, L1Entry<any>>;
    private l2Redis: Redis | null = null;
    private config: QueryCacheConfig;
    private l1Stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
    };
    private l2Stats = {
        hits: 0,
        misses: 0,
    };
    private initialized = false;

    constructor(config: QueryCacheConfig) {
        this.config = config;
        this.l1Cache = new Map();
        logger.debug(`Created query cache: L1(max=${config.l1.maxSize}, ttl=${config.l1.ttl}ms), L2(enabled=${config.l2.enabled})`);
    }

    /**
     * Initialize the cache
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (this.config.l2.enabled) {
            try {
                this.l2Redis = new Redis({
                    host: this.config.l2.host,
                    port: this.config.l2.port,
                    password: this.config.l2.password,
                    db: this.config.l2.db,
                    keyPrefix: this.config.l2.keyPrefix,
                    retryStrategy: (times) => {
                        const delay = Math.min(times * 50, 2000);
                        return delay;
                    },
                    maxRetriesPerRequest: 3,
                    enableReadyCheck: true,
                });

                // Test connection
                await this.l2Redis.ping();
                logger.info('L2 Redis cache connected successfully');
            } catch (error) {
                logger.warn('Failed to connect to L2 Redis cache:', error);
                logger.warn('Falling back to L1 cache only');
                this.l2Redis = null;
            }
        }

        this.initialized = true;
    }

    /**
     * Generate cache key from query
     *
     * @param query - Query object
     * @returns Cache key
     */
    private getCacheKey(query: any): string {
        // Sort keys for consistent hashing
        const sorted = JSON.stringify(query, Object.keys(query).sort());
        return `query:${Buffer.from(sorted).toString('base64')}`;
    }

    /**
     * Get data from cache
     *
     * @param query - Query to look up
     * @returns Cached data or null
     */
    async get<T>(query: any): Promise<T | null> {
        if (!this.initialized) {
            await this.initialize();
        }

        const key = this.getCacheKey(query);

        // L1: In-memory cache
        const l1Entry = this.l1Cache.get(key);
        if (l1Entry && l1Entry.expires > Date.now()) {
            this.l1Stats.hits++;
            logger.debug(`L1 cache hit for key: ${key.substring(0, 30)}...`);
            return l1Entry.data as T;
        }

        // Remove expired L1 entry
        if (l1Entry) {
            this.l1Cache.delete(key);
        }

        this.l1Stats.misses++;

        // L2: Redis cache
        if (this.l2Redis && this.config.l2.enabled) {
            try {
                const l2Data = await this.l2Redis.get(key);
                if (l2Data) {
                    const parsed = JSON.parse(l2Data);

                    // Populate L1 cache
                    this.setL1(key, parsed);

                    this.l2Stats.hits++;
                    logger.debug(`L2 cache hit for key: ${key.substring(0, 30)}...`);
                    return parsed as T;
                }
            } catch (error) {
                logger.warn('L2 cache read error:', error);
            }
        }

        this.l2Stats.misses++;
        logger.debug(`Cache miss for key: ${key.substring(0, 30)}...`);
        return null;
    }

    /**
     * Set data in cache
     *
     * @param query - Query object (used to generate key)
     * @param data - Data to cache
     */
    async set<T>(query: any, data: T): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }

        const key = this.getCacheKey(query);

        // Set L1 cache
        this.setL1(key, data);

        // Set L2 cache
        if (this.l2Redis && this.config.l2.enabled) {
            try {
                const serialized = JSON.stringify(data);
                const ttlSeconds = Math.ceil(this.config.l2.ttl / 1000);
                await this.l2Redis.setex(key, ttlSeconds, serialized);
                logger.debug(`Cached in L2: ${key.substring(0, 30)}...`);
            } catch (error) {
                logger.warn('L2 cache write error:', error);
            }
        }
    }

    /**
     * Set data in L1 cache
     *
     * @param key - Cache key
     * @param data - Data to cache
     */
    private setL1<T>(key: string, data: T): void {
        // Evict oldest entries if at capacity
        while (this.l1Cache.size >= this.config.l1.maxSize) {
            const firstKey = this.l1Cache.keys().next().value;
            if (firstKey !== undefined) {
                this.l1Cache.delete(firstKey);
                this.l1Stats.evictions++;
            }
        }

        const now = Date.now();
        this.l1Cache.set(key, {
            data,
            expires: now + this.config.l1.ttl,
            createdAt: now,
        });

        logger.debug(`Cached in L1: ${key.substring(0, 30)}...`);
    }

    /**
     * Invalidate a cache entry
     *
     * @param query - Query object
     */
    async invalidate(query: any): Promise<void> {
        const key = this.getCacheKey(query);

        // Remove from L1
        this.l1Cache.delete(key);

        // Remove from L2
        if (this.l2Redis && this.config.l2.enabled) {
            try {
                await this.l2Redis.del(key);
                logger.debug(`Invalidated cache: ${key.substring(0, 30)}...`);
            } catch (error) {
                logger.warn('L2 cache invalidate error:', error);
            }
        }
    }

    /**
     * Invalidate all entries matching a pattern
     *
     * @param pattern - Pattern to match (e.g., "query:*")
     */
    async invalidatePattern(pattern: string): Promise<void> {
        // Clear L1 cache entirely (simple approach)
        // For more selective clearing, we'd need to iterate
        this.l1Cache.clear();

        // Invalidate in L2
        if (this.l2Redis && this.config.l2.enabled) {
            try {
                const keys = await this.l2Redis.keys(`${this.config.l2.keyPrefix}${pattern}`);
                if (keys.length > 0) {
                    await this.l2Redis.del(...keys);
                    logger.debug(`Invalidated ${keys.length} keys matching pattern: ${pattern}`);
                }
            } catch (error) {
                logger.warn('L2 cache pattern invalidate error:', error);
            }
        }
    }

    /**
     * Clear all cache entries
     */
    async clear(): Promise<void> {
        this.l1Cache.clear();

        if (this.l2Redis && this.config.l2.enabled) {
            try {
                await this.l2Redis.flushdb();
                logger.info('L2 cache cleared');
            } catch (error) {
                logger.warn('L2 cache clear error:', error);
            }
        }

        logger.info('All caches cleared');
    }

    /**
     * Get cache statistics
     */
    getStats(): QueryCacheStats {
        const l1Total = this.l1Stats.hits + this.l1Stats.misses;
        const l2Total = this.l2Stats.hits + this.l2Stats.misses;
        const combinedTotal = l1Total + l2Total;

        return {
            l1: {
                size: this.l1Cache.size,
                maxSize: this.config.l1.maxSize,
                hits: this.l1Stats.hits,
                misses: this.l1Stats.misses,
                hitRate: l1Total > 0 ? Math.round((this.l1Stats.hits / l1Total) * 1000) / 1000 : 0,
                evictions: this.l1Stats.evictions,
            },
            l2: {
                enabled: this.config.l2.enabled,
                connected: this.l2Redis?.status === 'ready',
                hits: this.l2Stats.hits,
                misses: this.l2Stats.misses,
                hitRate: l2Total > 0 ? Math.round((this.l2Stats.hits / l2Total) * 1000) / 1000 : 0,
            },
            combined: {
                totalHits: this.l1Stats.hits + this.l2Stats.hits,
                totalMisses: this.l1Stats.misses + this.l2Stats.misses,
                overallHitRate: combinedTotal > 0
                    ? Math.round(((this.l1Stats.hits + this.l2Stats.hits) / combinedTotal) * 1000) / 1000
                    : 0,
            },
        };
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        this.l1Stats.hits = 0;
        this.l1Stats.misses = 0;
        this.l1Stats.evictions = 0;
        this.l2Stats.hits = 0;
        this.l2Stats.misses = 0;
    }

    /**
     * Evict expired L1 entries
     */
    evictExpiredL1(): number {
        const now = Date.now();
        let evicted = 0;

        for (const [key, entry] of this.l1Cache.entries()) {
            if (entry.expires <= now) {
                this.l1Cache.delete(key);
                evicted++;
            }
        }

        if (evicted > 0) {
            logger.debug(`Evicted ${evicted} expired L1 entries`);
        }

        return evicted;
    }

    /**
     * Check if cache is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Check if L2 cache is connected
     */
    isL2Connected(): boolean {
        return this.l2Redis?.status === 'ready';
    }

    /**
     * Close the cache and release resources
     */
    async close(): Promise<void> {
        if (this.l2Redis) {
            await this.l2Redis.quit();
            this.l2Redis = null;
        }
        this.l1Cache.clear();
        this.initialized = false;
        logger.info('Query cache closed');
    }
}

/**
 * Get query cache configuration from environment
 */
export function getQueryCacheConfigFromEnv(): QueryCacheConfig {
    const l2Enabled = process.env.MCP_CACHE_L2_ENABLED === 'true';

    return {
        l1: {
            maxSize: parseInt(process.env.MCP_CACHE_L1_MAX_SIZE || '1000', 10),
            ttl: parseInt(process.env.MCP_CACHE_L1_TTL || '60000', 10),
        },
        l2: {
            enabled: l2Enabled,
            host: process.env.MCP_REDIS_HOST || 'localhost',
            port: parseInt(process.env.MCP_REDIS_PORT || '6379', 10),
            password: process.env.MCP_REDIS_PASSWORD,
            db: parseInt(process.env.MCP_REDIS_DB || '0', 10),
            ttl: parseInt(process.env.MCP_CACHE_L2_TTL || '300000', 10),
            keyPrefix: process.env.MCP_CACHE_KEY_PREFIX || 'saga:',
        },
    };
}

/**
 * Create a query cache with environment configuration
 */
export async function createQueryCache(): Promise<QueryCache> {
    const config = getQueryCacheConfigFromEnv();
    const cache = new QueryCache(config);
    await cache.initialize();
    return cache;
}
