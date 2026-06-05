import { fileURLToPath } from "node:url";
import {
    type ContextQueryResult,
    createContextQuery,
    createMessageHeader,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { runManifest } from "./manifest";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

function nodeConfig(n: number) {
    return {
        serverId: `server:n${n}`,
        nodeId: `node:n${n}`,
        knowledgeId: `knowledge:n${n}`,
        role: { id: `role:n${n}`, name: `Node ${n}`, description: "test node" },
        accessPolicy: {
            fallbackAllowed: true,
            denialMode: "empty-result" as const,
        },
        knowledge: { filePath: FIXTURE, tags: ["test"] },
    };
}

function contextQueryEnvelope(knowledgeId: string) {
    const query = createContextQuery(
        "query:1",
        createRequesterDescriptor("principal:test"),
        knowledgeId,
        "text",
        "what is here?",
    );
    const header = createMessageHeader(
        "msg:1",
        "node:requester",
        knowledgeId,
        "context-query",
        { correlationId: "corr:1" },
    );
    const ctx = {
        id: "ctx:1",
        graphId: "graph:1",
        currentNode: "node:requester",
        accumulatedData: {},
        role: createRole("role:requester", "Requester", "requester"),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:requester"],
    };
    const message = createProtocolMessage(header, ctx, query);
    return {
        transportId: "memory",
        payload: message,
        receivedAt: new Date().toISOString(),
        metadata: {
            "gcp.credentials": { type: "token", value: "anon", metadata: {} },
        },
    };
}

describe("runManifest", () => {
    it("launches N nodes headless, each started and addressable", async () => {
        const launched = await runManifest({
            nodes: [nodeConfig(1), nodeConfig(2), nodeConfig(3)],
        });
        expect(launched).toHaveLength(3);
        expect(launched.map((l) => l.server.localNodeId).sort()).toEqual([
            "node:n1",
            "node:n2",
            "node:n3",
        ]);
        for (const { server } of launched) {
            expect(server.status).toBe("ready");
        }
    });

    it("each launched node answers a context-query with status ok", async () => {
        const launched = await runManifest({
            nodes: [nodeConfig(1), nodeConfig(2)],
        });
        for (const { config, server } of launched) {
            const result = await server.receive(
                contextQueryEnvelope(config.knowledgeId),
            );
            expect(result.success).toBe(true);
            if (result.success) {
                const response = (
                    result.data as {
                        response?: { payload: ContextQueryResult };
                    }
                ).response;
                expect(response?.payload.status).toBe("ok");
            }
        }
    });

    it("rejects an empty manifest", () => {
        expect(() => runManifest({ nodes: [] })).toThrow();
    });
});
