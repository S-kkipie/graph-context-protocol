import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createContextQuery,
    createGraph,
    createKnowledgeNode,
    createMessageHeader,
    createMetadataWithAccessPolicy,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
    type GraphContext,
    succeed,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createKnowledgeSourceRegistry } from "../knowledge/implementation";
import type { KnowledgeSourceAdapter } from "../knowledge/types";
import { createGraphContextServer } from "../server/implementation";
import { createFetchHandler } from "./fetch-handler";

const KNOWLEDGE_ID = "knowledge:peer";

function stubAdapter(): KnowledgeSourceAdapter {
    return {
        id: KNOWLEDGE_ID,
        capabilities: ["lookup"],
        async query() {
            return succeed({
                sourceId: KNOWLEDGE_ID,
                nodes: [],
                raw: "STUB CONTEXT TEXT",
                metadata: {},
            });
        },
    };
}

async function startServer() {
    const role = createRole("role:peer", "Peer", "");
    const policy = createAccessPolicyDescriptor([], [], true, "empty-result");
    const knowledge = createKnowledgeNode(
        KNOWLEDGE_ID,
        role,
        createMetadataWithAccessPolicy(policy, {
            contentType: "text/markdown",
        }),
    );
    const graph = createGraph("graph:peer")
        .addNode(createAgentNode("node:peer", role))
        .addNode(knowledge);

    const registered = createKnowledgeSourceRegistry().register(stubAdapter());
    const knowledgeSources = registered.success
        ? registered.data
        : createKnowledgeSourceRegistry();

    const server = createGraphContextServer(
        {
            id: "server:peer",
            localNodeId: "node:peer",
            shutdownTimeoutMs: 30000,
        },
        { graph, knowledgeSources },
    );
    await server.start();
    return server;
}

function buildRequest(): Request {
    const requester = createRequesterDescriptor("principal:test", [], []);
    const query = createContextQuery(
        "query:1",
        requester,
        KNOWLEDGE_ID,
        "text",
        "hello",
    );
    const header = createMessageHeader(
        "msg:1",
        "principal:test",
        KNOWLEDGE_ID,
        "context-query",
        {
            metadata: {
                "gcp.credentials": { type: "anonymous", value: "anonymous" },
            },
        },
    );
    const ctx: GraphContext = {
        id: "ctx:1",
        graphId: "graph:client",
        currentNode: "principal:test",
        accumulatedData: {},
        role: createRole("role:client", "Client", ""),
        metadata: {},
        createdAt: "2026-06-02T00:00:00.000Z",
        path: [],
    };
    const message = createProtocolMessage(header, ctx, query);
    return new Request("http://peer.test/api/gcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
    });
}

describe("createFetchHandler", () => {
    it("dispatches a context-query and returns the response message as JSON", async () => {
        const server = await startServer();
        const handler = createFetchHandler({ server });

        const response = await handler(buildRequest());

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            payload: { status: string; result: unknown };
        };
        expect(body.payload.status).toBe("ok");
        expect(body.payload.result).toBe("STUB CONTEXT TEXT");
    });

    it("returns 400 for an unparseable body", async () => {
        const server = await startServer();
        const handler = createFetchHandler({ server });
        const response = await handler(
            new Request("http://peer.test/api/gcp", {
                method: "POST",
                body: "not json",
            }),
        );
        expect(response.status).toBe(400);
    });
});
