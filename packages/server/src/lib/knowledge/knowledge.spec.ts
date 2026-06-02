import type { KnowledgeNode } from "@graph-context-protocol/core";
import {
    createKnowledgeNode,
    createRole,
    fail,
    succeed,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import type { Principal } from "../auth/types";
import { createServerError } from "../errors";
import { createKnowledgeSourceRegistry } from "./implementation";
import type {
    KnowledgeCapability,
    KnowledgeQueryRequest,
    KnowledgeSourceAdapter,
    KnowledgeSourceRegistry,
} from "./types";

const role = createRole("role:test", "Test Role", "Role for tests");

const requester: Principal = {
    id: "principal:test",
    agentId: "external-agent:test",
    role,
    capabilities: [],
    metadata: {},
};

function createRequest(): KnowledgeQueryRequest {
    return {
        requester,
        query: { kinds: ["knowledge"] },
        metadata: {},
    };
}

function createNode(id: string): KnowledgeNode {
    return createKnowledgeNode(id, role, { tags: ["docs"] });
}

function createAdapter(
    id: string,
    capabilities: readonly KnowledgeCapability[] = ["search"],
    nodes: readonly KnowledgeNode[] = [],
): KnowledgeSourceAdapter {
    return {
        id,
        capabilities,
        query: vi.fn(async () =>
            succeed({
                sourceId: id,
                nodes,
                metadata: {},
            }),
        ),
        sync: capabilities.includes("sync")
            ? vi.fn(async () =>
                  succeed({
                      sourceId: id,
                      nodesAdded: 0,
                      nodesUpdated: 0,
                      nodesRemoved: 0,
                      errors: [],
                  }),
              )
            : undefined,
    };
}

function expectRegistry(
    result: ReturnType<KnowledgeSourceRegistry["register"]>,
): KnowledgeSourceRegistry {
    expect(result.success).toBe(true);

    if (!result.success) {
        throw new Error(result.error.message);
    }

    return result.data;
}

function registerAdapters(
    adapters: readonly KnowledgeSourceAdapter[],
): KnowledgeSourceRegistry {
    let registry = createKnowledgeSourceRegistry();

    for (const adapter of adapters) {
        registry = expectRegistry(registry.register(adapter));
    }

    return registry;
}

describe("knowledge module", () => {
    describe("createKnowledgeSourceRegistry", () => {
        it("should register an adapter", () => {
            const registry = createKnowledgeSourceRegistry();
            const adapter = createAdapter("source:docs");

            const result = registry.register(adapter);

            const nextRegistry = expectRegistry(result);
            expect(registry.get("source:docs")).toBeUndefined();
            expect(nextRegistry.get("source:docs")).toBe(adapter);
            expect(nextRegistry.list()).toEqual([adapter]);
            expect(nextRegistry.list({ status: "registered" })).toEqual([
                adapter,
            ]);
        });

        it("should reject duplicate adapters", () => {
            const adapter = createAdapter("source:docs");
            const registry = registerAdapters([adapter]);

            const duplicateResult = registry.register(adapter);

            expect(duplicateResult.success).toBe(false);
            if (!duplicateResult.success) {
                expect(duplicateResult.error.code).toBe("conflict");
                expect(duplicateResult.error.metadata).toEqual({
                    sourceId: "source:docs",
                });
            }
        });

        it("should fan out queries to matching adapters", async () => {
            const firstNode = createNode("knowledge:first");
            const secondNode = createNode("knowledge:second");
            const firstAdapter = createAdapter(
                "source:first",
                ["search"],
                [firstNode],
            );
            const secondAdapter = createAdapter(
                "source:second",
                ["lookup"],
                [secondNode],
            );
            const registry = registerAdapters([firstAdapter, secondAdapter]);

            const queryResult = await registry.query(createRequest());

            expect(queryResult.success).toBe(true);
            if (queryResult.success) {
                expect(queryResult.data).toHaveLength(2);
                expect(
                    queryResult.data.map((result) => result.nodes[0]),
                ).toEqual([firstNode, secondNode]);
            }
            expect(firstAdapter.query).toHaveBeenCalledTimes(1);
            expect(secondAdapter.query).toHaveBeenCalledTimes(1);
        });

        it("should filter by adapter capabilities", async () => {
            const searchAdapter = createAdapter("source:search", ["search"]);
            const syncAdapter = createAdapter("source:sync", ["sync"]);
            const registry = registerAdapters([searchAdapter, syncAdapter]);

            const adapters = registry.list({ capabilities: ["search"] });
            const queryResult = await registry.query(createRequest());

            expect(adapters).toEqual([searchAdapter]);
            expect(queryResult.success).toBe(true);
            expect(searchAdapter.query).toHaveBeenCalledTimes(1);
            expect(syncAdapter.query).not.toHaveBeenCalled();
        });

        it("should add source metadata to adapter errors", async () => {
            const failingAdapter: KnowledgeSourceAdapter = {
                id: "source:failed",
                capabilities: ["search"],
                query: vi.fn(async () =>
                    fail(
                        createServerError("knowledge-error", "Adapter failed", {
                            metadata: { attempt: 1 },
                        }),
                    ),
                ),
            };
            const registry = registerAdapters([failingAdapter]);

            const result = await registry.query(createRequest());

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("knowledge-error");
                expect(result.error.metadata).toEqual({
                    attempt: 1,
                    sourceId: "source:failed",
                });
            }
        });
    });
});
