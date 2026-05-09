import {
    type ContextQuery,
    type ContextQueryResult,
    createAccessPolicyDescriptor,
    createAgentNode,
    createCapability,
    createContextQuery,
    createGraph,
    createKnowledgeNode,
    createMessageHeader,
    createMetadataWithAccessPolicy,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
    fail,
    type GraphNode,
    type ProtocolMessage,
    succeed,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import type { AuthProvider, Credentials, Principal } from "../auth/types.js";
import { createServerError } from "../errors.js";
import { createKnowledgeSourceRegistry } from "../knowledge/implementation.js";
import { createContextQueryHandler } from "./context-query-handler.js";
import type { HandlerContext } from "./types.js";

const role = createRole("role:viewer", "Viewer", "Can view", [
    createCapability("cap:read", "Read", "Can read"),
]);

const viewerPrincipal: Principal = {
    id: "principal:viewer",
    role,
    capabilities: ["cap:read"],
    metadata: {},
};

const creds: Credentials = {
    type: "token",
    value: "test-token",
    metadata: {},
};

function createAllowAllForPrincipal(p: Principal): AuthProvider {
    return {
        async authenticate() {
            return succeed(p);
        },
        authorize() {
            return succeed({ allowed: true });
        },
    };
}

function createDenyingAuthProvider(reason = "Blocked"): AuthProvider {
    return {
        async authenticate() {
            return succeed(viewerPrincipal);
        },
        authorize() {
            return succeed({ allowed: false, reason });
        },
    };
}

function createFailingAuthProvider(message = "Auth error"): AuthProvider {
    return {
        async authenticate() {
            return fail(createServerError("auth-error", message));
        },
        authorize() {
            return succeed({ allowed: true });
        },
    };
}

function createKnowledgeNodeWithPolicy(
    nodeId: string,
    readableByRoles: readonly string[],
): GraphNode {
    const policy = createAccessPolicyDescriptor(
        readableByRoles,
        [],
        false,
        "error",
    );
    const metadata = createMetadataWithAccessPolicy(policy);
    const ownerRole = createRole("role:owner", "Owner", "Owner");
    return createKnowledgeNode(nodeId, ownerRole, {
        tags: ["test"],
        contentType: "text/plain",
        ...metadata,
    });
}

function createContextQueryMessage(
    query: ContextQuery,
    sourceNodeId = "node:requester",
): ProtocolMessage {
    const header = createMessageHeader(
        "msg:1",
        sourceNodeId,
        query.targetNodeId,
        "context-query",
        {
            correlationId: "corr:1",
        },
    );
    const ctx = {
        id: "ctx:1",
        graphId: "graph:1",
        currentNode: sourceNodeId,
        accumulatedData: {},
        role,
        metadata: {},
        createdAt: new Date().toISOString(),
        path: [sourceNodeId],
    };
    return createProtocolMessage(header, ctx, query);
}

function createMockAdapter(id: string) {
    const registry = createKnowledgeSourceRegistry();
    const result = registry.register({
        id,
        capabilities: ["search"] as const,
        query: vi.fn(async () =>
            succeed({
                sourceId: id,
                nodes: [],
                raw: { answer: "ok" },
                metadata: {},
            }),
        ),
    });

    if (!result.success) {
        throw new Error(result.error.message);
    }

    return {
        registry: result.data,
        adapter: result.data.get(id)!,
        queryFn: result.data.get(id)!.query as ReturnType<typeof vi.fn>,
    };
}

describe("context-query-handler", () => {
    const handler = createContextQueryHandler();

    function makeContext(
        overrides: Partial<HandlerContext> = {},
    ): HandlerContext {
        const defaults: HandlerContext = {
            serverId: "server:1",
            localNodeId: "node:local",
            graph: undefined,
            connections: {} as unknown as HandlerContext["connections"],
            externalAgents: {} as unknown as HandlerContext["externalAgents"],
            knowledgeSources:
                {} as unknown as HandlerContext["knowledgeSources"],
            auth: createAllowAllForPrincipal(viewerPrincipal),
            inboundMetadata: { "gcp.credentials": creds },
            metadata: {},
        };
        return { ...defaults, ...overrides };
    }

    describe("successful flow", () => {
        it("should return ok for valid query with authorized access", async () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:viewer",
            ]);
            const graph = createGraph("graph:1").addNode(node);
            const { registry, queryFn } = createMockAdapter("knowledge:1");

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.handled).toBe(true);
                expect(result.data.response).toBeDefined();
                expect(result.data.response?.header.type).toBe(
                    "context-query-response",
                );
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("ok");
                expect(payload.queryId).toBe("query:1");
                expect(payload.sourceNodeId).toBe("knowledge:1");
                expect(queryFn).toHaveBeenCalledTimes(1);
            }
        });

        it("should use correlationId in response message", async () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:viewer",
            ]);
            const graph = createGraph("graph:1").addNode(node);
            const { registry } = createMockAdapter("knowledge:1");

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({ graph, knowledgeSources: registry });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                expect(result.data.response.header.correlationId).toBe("msg:1");
            }
        });
    });

    describe("invalid payload", () => {
        it("should return error for invalid payload", async () => {
            const message = createContextQueryMessage({
                not: "valid",
            } as unknown as ContextQuery);

            const context = makeContext();

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.handled).toBe(true);
                expect(result.data.response).toBeDefined();
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("error");
            }
        });
    });

    describe("authentication failures", () => {
        it("should deny when no auth provider is configured", async () => {
            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({ auth: undefined });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("denied");
            }
        });

        it("should deny when no credentials are provided", async () => {
            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                inboundMetadata: {},
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("denied");
                expect(payload.error).toContain("No credentials");
            }
        });

        it("should deny when auth provider fails authentication", async () => {
            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                auth: createFailingAuthProvider("Bad token"),
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("denied");
                expect(payload.error).toContain("Bad token");
            }
        });
    });

    describe("authorization denials", () => {
        it("should deny when auth provider denies authorization", async () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:viewer",
            ]);
            const graph = createGraph("graph:1").addNode(node);
            const { registry } = createMockAdapter("knowledge:1");

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
                auth: createDenyingAuthProvider("Provider block"),
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("denied");
                expect(result.data.metadata.denied).toBe(true);
            }
        });

        it("should deny and NOT call adapter when access policy blocks", async () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:ceo",
            ]);
            const graph = createGraph("graph:1").addNode(node);
            const { registry, queryFn } = createMockAdapter("knowledge:1");

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("denied");
                expect(queryFn).not.toHaveBeenCalled();
            }
        });
    });

    describe("target node resolution", () => {
        it("should return not-found when target node is missing from graph", async () => {
            const graph = createGraph("graph:1");
            const { registry } = createMockAdapter("knowledge:1");

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:missing",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("not-found");
            }
        });

        it("should deny when target node is not knowledge (e.g. agent)", async () => {
            const agentNode = createAgentNode("agent:1", role);
            const graph = createGraph("graph:1").addNode(agentNode);
            const { registry, queryFn } = createMockAdapter("agent:1");

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "agent:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("denied");
                expect(queryFn).not.toHaveBeenCalled();
            }
        });
    });

    describe("adapter results", () => {
        it("should propagate adapter error status in response", async () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:viewer",
            ]);
            const graph = createGraph("graph:1").addNode(node);

            let registry = createKnowledgeSourceRegistry();
            const failingAdapter = {
                id: "knowledge:1",
                capabilities: ["search"] as const,
                query: vi.fn(async () =>
                    fail(createServerError("knowledge-error", "Backend down")),
                ),
            };
            const regResult = registry.register(failingAdapter);
            if (!regResult.success) {
                throw new Error(regResult.error.message);
            }
            registry = regResult.data;

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("error");
                expect(payload.error).toBe("Backend down");
            }
        });

        it("should return not-found when no adapter exists for target", async () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:viewer",
            ]);
            const graph = createGraph("graph:1").addNode(node);

            const registry = createKnowledgeSourceRegistry();

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("not-found");
            }
        });
    });

    describe("fallback metadata", () => {
        it("should include fallback metadata when denied with fallback-allowed", async () => {
            const policy = createAccessPolicyDescriptor(
                ["role:ceo"],
                [],
                true,
                "fallback-if-allowed",
            );
            const metadata = createMetadataWithAccessPolicy(policy);
            const ownerRole = createRole("role:owner", "Owner", "Owner");
            const node = createKnowledgeNode("knowledge:1", ownerRole, {
                tags: ["test"],
                contentType: "text/plain",
                ...metadata,
            });
            const graph = createGraph("graph:1").addNode(node);
            const { registry, queryFn } = createMockAdapter("knowledge:1");

            const query = createContextQuery(
                "query:1",
                createRequesterDescriptor("p:req"),
                "knowledge:1",
                "text",
                "hello",
            );
            const message = createContextQueryMessage(query);

            const context = makeContext({
                graph,
                knowledgeSources: registry,
            });

            const result = await handler.handle(message, context);

            expect(result.success).toBe(true);
            if (result.success && result.data.response) {
                const payload = result.data.response
                    ?.payload as ContextQueryResult;
                expect(payload.status).toBe("denied");
                expect(queryFn).not.toHaveBeenCalled();
            }
        });
    });
});
