/**
 * In-memory cache store implementation.
 *
 * @module cache/implementation
 */

import type { Result } from "@graph-context-protocol/core";
import { fail, succeed } from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import { createServerError } from "../errors.js";
import type { CacheEntry, CacheOptions, CacheStore } from "./types.js";

class MemoryCacheStore implements CacheStore {
    private readonly entries = new Map<string, CacheEntry<unknown>>();
    private readonly tagIndex = new Map<string, Set<string>>();

    async get<T>(key: string): Promise<Result<T | undefined, ServerError>> {
        try {
            const entry = this.entries.get(key);

            if (entry === undefined) {
                return succeed(undefined);
            }

            if (this.isExpired(entry)) {
                this.deleteEntry(key);
                return succeed(undefined);
            }

            return succeed(entry.value as T);
        } catch (cause) {
            return fail(
                createServerError("cache-error", "Failed to read cache entry", {
                    cause,
                    metadata: { key },
                }),
            );
        }
    }

    async set<T>(
        key: string,
        value: T,
        options: CacheOptions = {},
    ): Promise<Result<void, ServerError>> {
        try {
            if (key.length === 0) {
                return fail(
                    createServerError(
                        "validation-error",
                        "Cache key is required",
                    ),
                );
            }

            if (options.ttlMs !== undefined && options.ttlMs < 0) {
                return fail(
                    createServerError(
                        "validation-error",
                        "Cache ttlMs must be non-negative",
                        { metadata: { key, ttlMs: options.ttlMs } },
                    ),
                );
            }

            this.deleteEntry(key);

            const now = Date.now();
            const tags = [...(options.tags ?? [])];
            const entry: CacheEntry<T> = {
                key,
                value,
                createdAt: new Date(now).toISOString(),
                expiresAt:
                    options.ttlMs === undefined
                        ? undefined
                        : new Date(now + options.ttlMs).toISOString(),
                tags,
            };

            this.entries.set(key, entry);
            for (const tag of tags) {
                this.addTagKey(tag, key);
            }

            return succeed(undefined);
        } catch (cause) {
            return fail(
                createServerError(
                    "cache-error",
                    "Failed to write cache entry",
                    {
                        cause,
                        metadata: { key },
                    },
                ),
            );
        }
    }

    async delete(key: string): Promise<Result<void, ServerError>> {
        try {
            this.deleteEntry(key);
            return succeed(undefined);
        } catch (cause) {
            return fail(
                createServerError(
                    "cache-error",
                    "Failed to delete cache entry",
                    {
                        cause,
                        metadata: { key },
                    },
                ),
            );
        }
    }

    async invalidateTag(tag: string): Promise<Result<number, ServerError>> {
        try {
            const keys = this.tagIndex.get(tag);

            if (keys === undefined) {
                return succeed(0);
            }

            let deleted = 0;
            for (const key of [...keys]) {
                if (this.entries.has(key)) {
                    deleted += 1;
                }
                this.deleteEntry(key);
            }

            this.tagIndex.delete(tag);
            return succeed(deleted);
        } catch (cause) {
            return fail(
                createServerError(
                    "cache-error",
                    "Failed to invalidate cache tag",
                    {
                        cause,
                        metadata: { tag },
                    },
                ),
            );
        }
    }

    async clear(): Promise<Result<void, ServerError>> {
        try {
            this.entries.clear();
            this.tagIndex.clear();
            return succeed(undefined);
        } catch (cause) {
            return fail(
                createServerError("cache-error", "Failed to clear cache", {
                    cause,
                }),
            );
        }
    }

    private isExpired(entry: CacheEntry<unknown>): boolean {
        return (
            entry.expiresAt !== undefined &&
            Date.now() >= Date.parse(entry.expiresAt)
        );
    }

    private addTagKey(tag: string, key: string): void {
        const keys = this.tagIndex.get(tag) ?? new Set<string>();
        keys.add(key);
        this.tagIndex.set(tag, keys);
    }

    private deleteEntry(key: string): void {
        const entry = this.entries.get(key);

        if (entry === undefined) {
            return;
        }

        this.entries.delete(key);
        for (const tag of entry.tags) {
            const keys = this.tagIndex.get(tag);
            if (keys === undefined) {
                continue;
            }

            keys.delete(key);
            if (keys.size === 0) {
                this.tagIndex.delete(tag);
            }
        }
    }
}

/**
 * Creates an in-memory cache store.
 *
 * Entries are expired lazily on read; no background timers are used.
 *
 * @returns Cache store backed by process memory
 */
export function createMemoryCacheStore(): CacheStore {
    return new MemoryCacheStore();
}
