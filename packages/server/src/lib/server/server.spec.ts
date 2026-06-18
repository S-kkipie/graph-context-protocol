import {
    type ContextPeerDescriptor,
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type ProtocolMessage,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { createPeerRegistry } from "../peers/implementation";
import { createHttpTransport } from "../transport/http-transport";
import { createTransportRegistry } from "../transport/implementation";
import { createGraphContextServer } from "./implementation";

const config = {
    id: "server:test",
    localNodeId: "node:local",
    shutdownTimeoutMs: 1000,
};

function localMessage(): ProtocolMessage {
    const header = createMessageHeader(
        "msg:test",
        "node:other",
        "node:local",
        "notification",
    );
    const ctx = {
        id: "ctx:test",
        graphId: "graph:test",
        currentNode: "node:other",
        accumulatedData: {},
        role: createRole("role:test", "Test Role", "A test role"),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:other"],
    };
    return createProtocolMessage(header, ctx, { value: "ping" });
}

describe("GraphContextServer lifecycle", () => {
    it("starts idle, transitions to ready on start, and to stopped on stop", async () => {
        const server = createGraphContextServer(config);
        expect(server.status).toBe("idle");

        const started = await server.start();
        expect(started.success).toBe(true);
        expect(server.status).toBe("ready");
        expect(server.snapshot().localNodeId).toBe("node:local");

        const stopped = await server.stop();
        expect(stopped.success).toBe(true);
        expect(server.status).toBe("stopped");
    });

    it("rejects start when already ready", async () => {
        const server = createGraphContextServer(config);
        await server.start();
        const again = await server.start();
        expect(again.success).toBe(false);
        if (!again.success) {
            expect(again.error.code).toBe("lifecycle-error");
        }
    });

    it("rejects send before the server is ready", async () => {
        const server = createGraphContextServer(config);
        const result = await server.send(localMessage());
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("lifecycle-error");
        }
    });

    it("delivers a message addressed to the local node once ready", async () => {
        const server = createGraphContextServer(config);
        await server.start();
        const result = await server.send(localMessage());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.delivered).toBe(true);
        }
    });

    it("rejects receive before the server is ready", async () => {
        const server = createGraphContextServer(config);
        const result = await server.receive({
            transportId: "memory",
            payload: localMessage(),
            receivedAt: new Date().toISOString(),
            metadata: {},
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("lifecycle-error");
        }
    });
});

// Minimal valid ProtocolMessage used as a fake peer response body
function responseMessage(): ProtocolMessage {
    const header = createMessageHeader(
        "msg:response",
        "node:peer",
        "node:local",
        "notification",
    );
    const ctx = {
        id: "ctx:response",
        graphId: "graph:test",
        currentNode: "node:peer",
        accumulatedData: {},
        role: createRole("role:test", "Test Role", "A test role"),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:peer"],
    };
    return createProtocolMessage(header, ctx, { value: "pong" });
}

function buildPeerDescriptor(
    peerId: string,
    knowledgeNodeId: string,
    endpoint: string,
): ContextPeerDescriptor {
    const exposed = createExposedKnowledgeDescriptor(
        knowledgeNodeId,
        "text",
        true,
        createKnowledgeQueryContract(["text"], false),
        createAccessPolicyDescriptor([], [], true, "empty-result"),
        [],
    );
    return createContextPeerDescriptor(
        `peer-desc:${peerId}`,
        peerId,
        endpoint,
        createAuthContract(["bearer-token"], false),
        [exposed],
        [],
    );
}

describe("GraphContextServer send — M3 knowledge-source delivery", () => {
    it("delivers a knowledge-source route to the peer over HttpTransport (M3)", async () => {
        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify(responseMessage()), {
                    status: 200,
                }),
        ) as unknown as typeof fetch;

        const httpTransport = createHttpTransport({
            fetchImpl,
            resolveEndpoint: (e) =>
                e.metadata["gcp.peerEndpoint"] as string | undefined,
        });

        const registryResult =
            createTransportRegistry().register(httpTransport);
        expect(registryResult.success).toBe(true);
        if (!registryResult.success) return;
        const transports = registryResult.data;

        const peers = createPeerRegistry([
            buildPeerDescriptor(
                "peer:remote",
                "knowledge:remote",
                "http://remote/gcp",
            ),
        ]);

        const server = createGraphContextServer(
            { id: "server:1", localNodeId: "node:local" },
            { transports, peers },
        );
        await server.start();

        const header = createMessageHeader(
            "msg:query",
            "node:local",
            "knowledge:remote",
            "context-query",
        );
        const ctx = {
            id: "ctx:query",
            graphId: "graph:test",
            currentNode: "node:local",
            accumulatedData: {},
            role: createRole("role:test", "Test Role", "A test role"),
            metadata: {},
            createdAt: new Date().toISOString(),
            path: ["node:local"],
        };
        const queryMessage = createProtocolMessage(header, ctx, {
            query: "status?",
        });

        const result = await server.send(queryMessage);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.delivered).toBe(true);
        }
        expect(
            (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
        ).toBe("http://remote/gcp");
    });
});
