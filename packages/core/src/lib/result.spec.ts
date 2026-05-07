import { describe, expect, it } from "vitest";
import { fail, type Result, succeed, validateWithSchema } from "./result";
import { NodeIdSchema } from "./types";

describe("result", () => {
    describe("succeed", () => {
        it("should create a successful result", () => {
            const data = { id: "test" };
            const result = succeed(data);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe(data);
            }
        });
    });

    describe("fail", () => {
        it("should create a failed result", () => {
            const error = new Error("test error");
            const result = fail(error);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe(error);
            }
        });
    });

    describe("validateWithSchema", () => {
        it("should return success for valid data", () => {
            const result = validateWithSchema(NodeIdSchema, "valid-id");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe("valid-id");
            }
        });

        it("should return failure for invalid data", () => {
            const result = validateWithSchema(NodeIdSchema, "");

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeDefined();
            }
        });
    });

    describe("Result type", () => {
        it("should accept success variant", () => {
            const result: Result<string> = succeed("test");
            expect(result.success).toBe(true);
        });

        it("should accept failure variant", () => {
            const result: Result<string> = fail(new Error("test"));
            expect(result.success).toBe(false);
        });
    });
});
