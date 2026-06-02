import { describe, expect, it } from "vitest";
import { createServerError, ServerErrorClass } from "./errors";

describe("errors", () => {
    describe("createServerError", () => {
        it("should create error with code and message", () => {
            const error = createServerError("not-found", "Resource not found");
            expect(error.code).toBe("not-found");
            expect(error.message).toBe("Resource not found");
        });

        it("should include cause when provided", () => {
            const cause = new Error("Original error");
            const error = createServerError(
                "internal-error",
                "Something failed",
                { cause },
            );
            expect(error.cause).toBe(cause);
        });

        it("should include metadata when provided", () => {
            const metadata = { resourceId: "123" };
            const error = createServerError("not-found", "Resource not found", {
                metadata,
            });
            expect(error.metadata).toEqual(metadata);
        });

        it("should have readonly properties", () => {
            const error = createServerError(
                "validation-error",
                "Invalid input",
            );
            expect(error.code).toBe("validation-error");
            expect(error.message).toBe("Invalid input");
        });
    });

    describe("ServerErrorClass", () => {
        it("should be instanceof Error", () => {
            const error = new ServerErrorClass("internal-error", "Failed");
            expect(error).toBeInstanceOf(Error);
        });

        it("should have correct name", () => {
            const error = new ServerErrorClass("internal-error", "Failed");
            expect(error.name).toBe("ServerError");
        });

        it("should store code", () => {
            const error = new ServerErrorClass("auth-error", "Unauthorized");
            expect(error.code).toBe("auth-error");
        });

        it("should store cause", () => {
            const cause = new Error("Original");
            const error = new ServerErrorClass("internal-error", "Failed", {
                cause,
            });
            expect(error.cause).toBe(cause);
        });

        it("should store metadata", () => {
            const metadata = { userId: "123" };
            const error = new ServerErrorClass("auth-error", "Unauthorized", {
                metadata,
            });
            expect(error.metadata).toEqual(metadata);
        });
    });
});
