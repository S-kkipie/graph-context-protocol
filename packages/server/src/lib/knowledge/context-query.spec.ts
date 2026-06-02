import {
    type ContextQuery,
    createContextQuery,
    createKnowledgeNode,
    createRequesterDescriptor,
    createRole,
    fail,
    succeed,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import type { Principal } from "../auth/types";
import { createServerError } from "../errors";
import { executeTargetedContextQuery } from "./context-query";
import { createKnowledgeSourceRegistry } from "./implementation";
import type { KnowledgeSourceAdapter, KnowledgeSourceRegistry } from "./types";

const role = createRole("role:test", "Test Role", "Test");

const requesterDescriptor = createRequesterDescriptor(
    "principal:req",
    ["role:viewer"],
    ["cap:read"],
);

const principal: Principal = {
    id: "principal:server",
    role,
    capabilities: [],
    metadata: {},
};

function createQuery(targetNodeId: string, queryId = "query:1"): ContextQuery {
    return createContextQuery(
        queryId,
        requesterDescriptor,
        targetNodeId,
        "text",
        "test query",
    );
}

function createAdapter(
    id: string,
    nodes = [createKnowledgeNode("k:1", role)],
): KnowledgeSourceAdapter {
    return {
        id,
        capabilities: ["search"],
        query: vi.fn(async () =>
            succeed({
                sourceId: id,
                nodes,
                raw: { answer: "result data" },
                metadata: { sourceOfTruth: "trusted" },
            }),
        ),
    };
}

function registerAdapter(
    adapter: KnowledgeSourceAdapter,
): KnowledgeSourceRegistry {
    const registry = createKnowledgeSourceRegistry();
    const result = registry.register(adapter);

    if (!result.success) {
        throw new Error(result.error.message);
    }

    return result.data;
}

describe("context-query execution", () => {
    describe("executeTargetedContextQuery", () => {
        it("should return ok with raw result from adapter", async () => {
            const adapter = createAdapter("node:target");
            const registry = registerAdapter(adapter);
            const query = createQuery("node:target");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.status).toBe("ok");
            expect(result.queryId).toBe("query:1");
            expect(result.sourceNodeId).toBe("node:target");
            expect(result.result).toEqual({ answer: "result data" });
            expect(result.error).toBeUndefined();
        });

        it("should return ok with nodes when raw is undefined", async () => {
            const node = createKnowledgeNode("k:1", role);
            const adapter: KnowledgeSourceAdapter = {
                id: "node:target",
                capabilities: ["search"],
                query: vi.fn(async () =>
                    succeed({
                        sourceId: "node:target",
                        nodes: [node],
                        metadata: {},
                    }),
                ),
            };
            const registry = registerAdapter(adapter);
            const query = createQuery("node:target");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.status).toBe("ok");
            expect(result.result).toEqual([node]);
        });

        it("should return not-found when no adapter matches targetNodeId", async () => {
            const registry = createKnowledgeSourceRegistry();
            const query = createQuery("node:nonexistent");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.status).toBe("not-found");
            expect(result.result).toBeUndefined();
        });

        it("should return error when adapter query fails", async () => {
            const adapter: KnowledgeSourceAdapter = {
                id: "node:failing",
                capabilities: ["search"],
                query: vi.fn(async () =>
                    fail(
                        createServerError(
                            "knowledge-error",
                            "Backend unavailable",
                        ),
                    ),
                ),
            };
            const registry = registerAdapter(adapter);
            const query = createQuery("node:failing");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.status).toBe("error");
            expect(result.error).toBe("Backend unavailable");
        });

        it("should return unavailable for timeout errors", async () => {
            const adapter: KnowledgeSourceAdapter = {
                id: "node:timeout",
                capabilities: ["search"],
                query: vi.fn(async () =>
                    fail(createServerError("timeout", "Timed out")),
                ),
            };
            const registry = registerAdapter(adapter);
            const query = createQuery("node:timeout");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.status).toBe("unavailable");
        });

        it("should return error when adapter throws", async () => {
            const adapter: KnowledgeSourceAdapter = {
                id: "node:crash",
                capabilities: ["search"],
                query: vi.fn(async () => {
                    throw new Error("Crash");
                }),
            };
            const registry = registerAdapter(adapter);
            const query = createQuery("node:crash");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.status).toBe("error");
            expect(result.error).toContain("Knowledge source query failed");
        });

        it("should preserve provenance and source metadata in ok result", async () => {
            const adapter = createAdapter("node:source");
            const registry = registerAdapter(adapter);
            const query = createQuery("node:source");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.provenance).toBeDefined();
            if (result.provenance) {
                expect(result.provenance.sourceId).toBe("node:source");
                expect(result.provenance.sourceOfTruth).toBe("trusted");
                expect(result.provenance.queryId).toBe("query:1");
            }
        });

        it("should override sourceNodeId when options.sourceNodeId is set", async () => {
            const adapter = createAdapter("node:target");
            const registry = registerAdapter(adapter);
            const query = createQuery("node:target");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
                { sourceNodeId: "node:override" },
            );

            expect(result.sourceNodeId).toBe("node:override");
        });

        it("should merge metadata from query, options, and internal sources", async () => {
            const adapter = createAdapter("node:target");
            const registry = registerAdapter(adapter);
            const query = createContextQuery(
                "query:1",
                requesterDescriptor,
                "node:target",
                "text",
                "test",
                { queryMeta: "from-query" },
            );

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
                { metadata: { extra: "from-options" } },
            );

            expect(result.metadata.queryMeta).toBe("from-query");
            expect(result.metadata.extra).toBe("from-options");
            expect(result.metadata.targetNodeId).toBe("node:target");
            expect(result.metadata.sourceId).toBe("node:target");
        });

        it("should not call other adapters (no fan-out)", async () => {
            const targetAdapter = createAdapter("node:target");
            const otherAdapter = createAdapter("node:other");
            let registry = registerAdapter(targetAdapter);
            const regResult = registry.register(otherAdapter);

            if (!regResult.success) {
                throw new Error(regResult.error.message);
            }

            registry = regResult.data;
            const query = createQuery("node:target");

            const result = await executeTargetedContextQuery(
                query,
                principal,
                registry,
            );

            expect(result.status).toBe("ok");
            expect(targetAdapter.query).toHaveBeenCalledTimes(1);
            expect(otherAdapter.query).not.toHaveBeenCalled();
        });

        it("should pass the validated context query payload to the adapter", async () => {
            const adapter = createAdapter("node:target");
            const registry = registerAdapter(adapter);
            const query = createContextQuery(
                "query:payload",
                requesterDescriptor,
                "node:target",
                "structured",
                { question: "what changed?" },
                { audit: "kept" },
                { since: "today" },
            );

            await executeTargetedContextQuery(query, principal, registry);

            expect(adapter.query).toHaveBeenCalledTimes(1);
            const request = vi.mocked(adapter.query).mock.calls[0][0];
            expect(request.contextQuery).toEqual(query);
            expect(request.contextQuery?.query).toEqual({
                question: "what changed?",
            });
            expect(request.contextQuery?.mode).toBe("structured");
            expect(request.contextQuery?.queryId).toBe("query:payload");
            expect(request.contextQuery?.filters).toEqual({ since: "today" });
            expect(request.contextQuery?.requester).toEqual(
                requesterDescriptor,
            );
        });
    });
});
