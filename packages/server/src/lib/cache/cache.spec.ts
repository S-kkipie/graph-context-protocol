import { describe, expect, it } from "vitest";
import { createMemoryCacheStore } from "./implementation.js";

describe("cache module", () => {
    describe("createMemoryCacheStore", () => {
        it("should return undefined for a missing key", async () => {
            const cache = createMemoryCacheStore();

            const result = await cache.get<string>("missing");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBeUndefined();
            }
        });

        it("should set and get values", async () => {
            const cache = createMemoryCacheStore();

            const setResult = await cache.set("key:1", { value: 42 });
            const getResult = await cache.get<{ value: number }>("key:1");

            expect(setResult.success).toBe(true);
            expect(getResult.success).toBe(true);
            if (getResult.success) {
                expect(getResult.data).toEqual({ value: 42 });
            }
        });

        it("should delete values", async () => {
            const cache = createMemoryCacheStore();

            await cache.set("key:1", "value");
            const deleteResult = await cache.delete("key:1");
            const getResult = await cache.get<string>("key:1");

            expect(deleteResult.success).toBe(true);
            expect(getResult.success).toBe(true);
            if (getResult.success) {
                expect(getResult.data).toBeUndefined();
            }
        });

        it("should expire values on get", async () => {
            const cache = createMemoryCacheStore();

            await cache.set("key:1", "value", { ttlMs: 0 });
            const result = await cache.get<string>("key:1");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBeUndefined();
            }
        });

        it("should invalidate all values for a tag", async () => {
            const cache = createMemoryCacheStore();

            await cache.set("key:1", "one", { tags: ["docs"] });
            await cache.set("key:2", "two", { tags: ["docs", "api"] });
            await cache.set("key:3", "three", { tags: ["api"] });

            const invalidateResult = await cache.invalidateTag("docs");
            const firstResult = await cache.get<string>("key:1");
            const secondResult = await cache.get<string>("key:2");
            const thirdResult = await cache.get<string>("key:3");

            expect(invalidateResult.success).toBe(true);
            if (invalidateResult.success) {
                expect(invalidateResult.data).toBe(2);
            }

            expect(firstResult.success).toBe(true);
            expect(secondResult.success).toBe(true);
            expect(thirdResult.success).toBe(true);
            if (
                firstResult.success &&
                secondResult.success &&
                thirdResult.success
            ) {
                expect(firstResult.data).toBeUndefined();
                expect(secondResult.data).toBeUndefined();
                expect(thirdResult.data).toBe("three");
            }
        });

        it("should clear all values and tag indexes", async () => {
            const cache = createMemoryCacheStore();

            await cache.set("key:1", "one", { tags: ["docs"] });
            await cache.set("key:2", "two", { tags: ["api"] });
            const clearResult = await cache.clear();
            const getResult = await cache.get<string>("key:1");
            const invalidateResult = await cache.invalidateTag("api");

            expect(clearResult.success).toBe(true);
            expect(getResult.success).toBe(true);
            expect(invalidateResult.success).toBe(true);
            if (getResult.success && invalidateResult.success) {
                expect(getResult.data).toBeUndefined();
                expect(invalidateResult.data).toBe(0);
            }
        });
    });
});
