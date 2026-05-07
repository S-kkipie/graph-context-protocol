import { describe, expect, it } from "vitest";
import { MetadataSchema, NodeIdSchema } from "./types";

describe("types", () => {
    describe("NodeIdSchema", () => {
        it("should validate valid node IDs", () => {
            const result = NodeIdSchema.safeParse("node-1");
            expect(result.success).toBe(true);
        });

        it("should reject empty strings", () => {
            const result = NodeIdSchema.safeParse("");
            expect(result.success).toBe(false);
        });
    });

    describe("MetadataSchema", () => {
        it("should validate empty objects", () => {
            const result = MetadataSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it("should validate objects with string keys and unknown values", () => {
            const result = MetadataSchema.safeParse({
                key1: "value",
                key2: 123,
                key3: { nested: true },
            });
            expect(result.success).toBe(true);
        });
    });
});
