/**
 * Cache store types.
 *
 * @module cache/types
 */

import type { Result, Timestamp } from "@graph-context-protocol/core";
import type { ServerError } from "../errors";

/**
 * Stored cache value with creation, expiry, and tag metadata.
 */
export interface CacheEntry<T> {
    readonly key: string;
    readonly value: T;
    readonly createdAt: Timestamp;
    readonly expiresAt?: Timestamp;
    readonly tags: readonly string[];
}

/**
 * Options for writing a cache entry.
 */
export interface CacheOptions {
    /** Entry lifetime in milliseconds */
    readonly ttlMs?: number;
    /** Tags used for grouped invalidation */
    readonly tags?: readonly string[];
}

/**
 * Async cache store abstraction.
 */
export interface CacheStore {
    get<T>(key: string): Promise<Result<T | undefined, ServerError>>;
    set<T>(
        key: string,
        value: T,
        options?: CacheOptions,
    ): Promise<Result<void, ServerError>>;
    delete(key: string): Promise<Result<void, ServerError>>;
    invalidateTag(tag: string): Promise<Result<number, ServerError>>;
    clear(): Promise<Result<void, ServerError>>;
}
