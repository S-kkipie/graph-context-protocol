import { describe, expect, it } from "vitest";
import {
    createContextQuery,
    createContextQueryResult,
    createRequesterDescriptor,
} from "./context-query-factories";
import {
    ContextQueryRequestSchema,
    ContextQueryResponseSchema,
    ContextQueryStatusSchema,
    QueryModeSchema,
} from "./context-query-factories";
import type { ContextQuery, ContextQueryResult } from "./context-query-types";

describe("context-query module", () => {
    const requester = createRequesterDescriptor(
        "principal:1",
        ["role:researcher"],
        ["cap:read-context"],
        { source: "test" },
    );

    describe("createRequesterDescriptor", () => {
        it("should create a descriptor with all required fields", () => {
            const descriptor = createRequesterDescriptor(
                "principal:1",
                ["role:admin"],
                ["cap:read-context"],
                { key: "value" },
            );

            expect(descriptor.principalId).toBe("principal:1");
            expect(descriptor.roles).toEqual(["role:admin"]);
            expect(descriptor.capabilities).toEqual(["cap:read-context"]);
            expect(descriptor.metadata).toEqual({ key: "value" });
        });

        it("should default roles to empty array", () => {
            const descriptor = createRequesterDescriptor("principal:1");
            expect(descriptor.roles).toEqual([]);
        });

        it("should default capabilities to empty array", () => {
            const descriptor = createRequesterDescriptor("principal:1");
            expect(descriptor.capabilities).toEqual([]);
        });

        it("should default metadata to empty object", () => {
            const descriptor = createRequesterDescriptor("principal:1");
            expect(descriptor.metadata).toEqual({});
        });
    });

    describe("createContextQuery", () => {
        it("should create a valid text query", () => {
            const query = createContextQuery(
                "query:1",
                requester,
                "node:target",
                "text",
                "find all agents",
            );

            expect(query.contractVersion).toBe("gcp-context-contract/v1");
            expect(query.queryId).toBe("query:1");
            expect(query.requester).toEqual(requester);
            expect(query.targetNodeId).toBe("node:target");
            expect(query.mode).toBe("text");
            expect(query.query).toBe("find all agents");
            expect(query.metadata).toEqual({});
        });

        it("should create a valid structured query", () => {
            const structuredQuery = {
                field: "name",
                operator: "eq",
                value: "agent:1",
            };

            const query = createContextQuery(
                "query:2",
                requester,
                "node:target",
                "structured",
                structuredQuery,
            );

            expect(query.mode).toBe("structured");
            expect(query.query).toEqual(structuredQuery);
        });

        it("should accept hybrid mode", () => {
            const query = createContextQuery(
                "query:3",
                requester,
                "node:target",
                "hybrid",
                "hybrid query",
            );

            expect(query.mode).toBe("hybrid");
        });

        it("should default metadata to empty object", () => {
            const query = createContextQuery(
                "query:1",
                requester,
                "node:target",
                "text",
                "query",
            );

            expect(query.metadata).toEqual({});
        });

        it("should accept custom metadata", () => {
            const query = createContextQuery(
                "query:1",
                requester,
                "node:target",
                "text",
                "query",
                { priority: "high" },
            );

            expect(query.metadata).toEqual({ priority: "high" });
        });

        it("should accept optional filters", () => {
            const filters = { field: "tag", value: "api" };
            const query = createContextQuery(
                "query:1",
                requester,
                "node:target",
                "text",
                "query",
                {},
                filters,
            );

            expect(query.filters).toEqual(filters);
        });
    });

    describe("createContextQueryResult", () => {
        it("should create an ok result", () => {
            const result = createContextQueryResult(
                "query:1",
                "ok",
                "node:source",
                {},
                { data: "value" },
            );

            expect(result.contractVersion).toBe("gcp-context-contract/v1");
            expect(result.queryId).toBe("query:1");
            expect(result.status).toBe("ok");
            expect(result.sourceNodeId).toBe("node:source");
            expect(result.result).toEqual({ data: "value" });
            expect(result.error).toBeUndefined();
        });

        it("should create a denied result", () => {
            const result = createContextQueryResult(
                "query:1",
                "denied",
                "node:source",
                {},
            );

            expect(result.status).toBe("denied");
            expect(result.result).toBeUndefined();
        });

        it("should create an error result with message", () => {
            const result = createContextQueryResult(
                "query:1",
                "error",
                "node:source",
                {},
                undefined,
                "Something went wrong",
            );

            expect(result.status).toBe("error");
            expect(result.error).toBe("Something went wrong");
            expect(result.result).toBeUndefined();
        });

        it("should default metadata to empty object", () => {
            const result = createContextQueryResult(
                "query:1",
                "ok",
                "node:source",
            );

            expect(result.metadata).toEqual({});
        });

        it("should preserve provenance entries", () => {
            const provenance = { nodeId: "node:relay", action: "forwarded" };
            const result = createContextQueryResult(
                "query:1",
                "ok",
                "node:source",
                {},
                undefined,
                undefined,
                provenance,
            );

            expect(result.provenance).toEqual(provenance);
        });
    });

    describe("Zod schema validation", () => {
        it("should reject invalid contract version", () => {
            const invalid = {
                contractVersion: "invalid",
                queryId: "query:1",
                requester: {
                    principalId: "p:1",
                    roles: [],
                    capabilities: [],
                    metadata: {},
                },
                targetNodeId: "node:1",
                mode: "text",
                query: "test",
                metadata: {},
            };

            const result = ContextQueryRequestSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should reject invalid query mode", () => {
            const invalid = {
                contractVersion: "gcp-context-contract/v1",
                queryId: "query:1",
                requester: {
                    principalId: "p:1",
                    roles: [],
                    capabilities: [],
                    metadata: {},
                },
                targetNodeId: "node:1",
                mode: "invalid-mode",
                query: "test",
                metadata: {},
            };

            const result = ContextQueryRequestSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should reject invalid status", () => {
            const invalid = {
                contractVersion: "gcp-context-contract/v1",
                queryId: "query:1",
                status: "invalid-status",
                sourceNodeId: "node:1",
                metadata: {},
            };

            const result = ContextQueryResponseSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should accept all valid query modes", () => {
            const modes = ["text", "semantic", "structured", "hybrid"];

            for (const mode of modes) {
                const result = QueryModeSchema.safeParse(mode);
                expect(result.success).toBe(true);
            }
        });

        it("should accept all valid statuses", () => {
            const statuses = [
                "ok",
                "denied",
                "not-found",
                "invalid-query",
                "unavailable",
                "error",
            ];

            for (const status of statuses) {
                const result = ContextQueryStatusSchema.safeParse(status);
                expect(result.success).toBe(true);
            }
        });

        it("should preserve structured query objects", () => {
            const structuredQuery = {
                field: "name",
                nested: { value: 42, active: true },
                list: [1, 2, 3],
            };

            const query = createContextQuery(
                "query:1",
                requester,
                "node:target",
                "structured",
                structuredQuery,
            );

            expect(query.query).toEqual(structuredQuery);
        });
    });

    describe("public factory import via context index", () => {
        it("should import factories from context index", () => {
            const q = createContextQuery(
                "query:1",
                requester,
                "node:target",
                "text",
                "hello",
            ) satisfies ContextQuery;

            const r = createContextQueryResult(
                "query:1",
                "ok",
                "node:source",
            ) satisfies ContextQueryResult;

            expect(q.queryId).toBe("query:1");
            expect(r.status).toBe("ok");
        });
    });
});
