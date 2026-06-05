import {
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type ProtocolMessage,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
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
