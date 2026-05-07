import { describe, expect, it } from "vitest";
import {
    ConnectionIdSchema,
    ExternalAgentIdSchema,
    KnowledgeSourceIdSchema,
    ServerConfigSchema,
    ServerIdSchema,
    ServerStatusSchema,
    SessionIdSchema,
    TransportIdSchema,
} from "./types.js";

describe("types", () => {
    describe("ServerIdSchema", () => {
        it("should validate non-empty string", () => {
            const result = ServerIdSchema.safeParse("server:1");
            expect(result.success).toBe(true);
        });

        it("should reject empty string", () => {
            const result = ServerIdSchema.safeParse("");
            expect(result.success).toBe(false);
        });
    });

    describe("ConnectionIdSchema", () => {
        it("should validate non-empty string", () => {
            const result = ConnectionIdSchema.safeParse("conn:1");
            expect(result.success).toBe(true);
        });

        it("should reject empty string", () => {
            const result = ConnectionIdSchema.safeParse("");
            expect(result.success).toBe(false);
        });
    });

    describe("SessionIdSchema", () => {
        it("should validate non-empty string", () => {
            const result = SessionIdSchema.safeParse("session:1");
            expect(result.success).toBe(true);
        });

        it("should reject empty string", () => {
            const result = SessionIdSchema.safeParse("");
            expect(result.success).toBe(false);
        });
    });

    describe("TransportIdSchema", () => {
        it("should validate non-empty string", () => {
            const result = TransportIdSchema.safeParse("transport:1");
            expect(result.success).toBe(true);
        });

        it("should reject empty string", () => {
            const result = TransportIdSchema.safeParse("");
            expect(result.success).toBe(false);
        });
    });

    describe("KnowledgeSourceIdSchema", () => {
        it("should validate non-empty string", () => {
            const result =
                KnowledgeSourceIdSchema.safeParse("knowledge-source:1");
            expect(result.success).toBe(true);
        });

        it("should reject empty string", () => {
            const result = KnowledgeSourceIdSchema.safeParse("");
            expect(result.success).toBe(false);
        });
    });

    describe("ExternalAgentIdSchema", () => {
        it("should validate non-empty string", () => {
            const result = ExternalAgentIdSchema.safeParse("external-agent:1");
            expect(result.success).toBe(true);
        });

        it("should reject empty string", () => {
            const result = ExternalAgentIdSchema.safeParse("");
            expect(result.success).toBe(false);
        });
    });

    describe("ServerStatusSchema", () => {
        it("should validate valid statuses", () => {
            const statuses = [
                "idle",
                "starting",
                "ready",
                "draining",
                "stopping",
                "stopped",
                "failed",
            ];
            for (const status of statuses) {
                const result = ServerStatusSchema.safeParse(status);
                expect(result.success).toBe(true);
            }
        });

        it("should reject invalid status", () => {
            const result = ServerStatusSchema.safeParse("invalid");
            expect(result.success).toBe(false);
        });
    });

    describe("ServerConfigSchema", () => {
        it("should validate complete config", () => {
            const result = ServerConfigSchema.safeParse({
                id: "server:1",
                localNodeId: "node:1",
                shutdownTimeoutMs: 30000,
                metadata: { version: "1.0" },
            });
            expect(result.success).toBe(true);
        });

        it("should apply default shutdownTimeoutMs", () => {
            const result = ServerConfigSchema.safeParse({
                id: "server:1",
                localNodeId: "node:1",
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.shutdownTimeoutMs).toBe(30000);
            }
        });

        it("should reject missing id", () => {
            const result = ServerConfigSchema.safeParse({
                localNodeId: "node:1",
            });
            expect(result.success).toBe(false);
        });

        it("should reject missing localNodeId", () => {
            const result = ServerConfigSchema.safeParse({
                id: "server:1",
            });
            expect(result.success).toBe(false);
        });

        it("should reject negative shutdownTimeoutMs", () => {
            const result = ServerConfigSchema.safeParse({
                id: "server:1",
                localNodeId: "node:1",
                shutdownTimeoutMs: -1,
            });
            expect(result.success).toBe(false);
        });
    });
});
