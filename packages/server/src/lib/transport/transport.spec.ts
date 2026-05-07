import { describe, expect, it, vi } from "vitest";
import type {
    DeliveryReceipt,
    OutboundMessageEnvelope,
    TransportId,
} from "../types.js";
import {
    createMemoryTransport,
    createTransportRegistry,
} from "./implementation.js";
import type {
    Transport,
    TransportEnvelope,
    TransportSnapshot,
} from "./types.js";

const createProtocolMessage = () => ({
    header: {
        messageId: "msg:test",
        source: "node:source",
        target: "node:target",
        type: "notification" as const,
        priority: "normal" as const,
        timestamp: new Date().toISOString(),
        ttl: 60,
        metadata: {},
    },
    context: {
        id: "ctx:test",
        graphId: "graph:test",
        currentNode: "node:source",
        accumulatedData: {},
        role: {
            id: "role:test",
            name: "Test Role",
            description: "A test role",
            capabilities: [],
            contextRules: [],
            metadata: {},
            hasCapability: () => false,
            getEffectiveContextRules: () => [],
        },
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:source"],
    },
    payload: { value: "test" },
    provenance: [
        {
            nodeId: "node:source",
            timestamp: new Date().toISOString(),
            action: "received" as const,
        },
    ],
});

const createOutboundEnvelope = (
    transportId: TransportId,
): OutboundMessageEnvelope => ({
    transportId,
    connectionId: "conn:test",
    payload: createProtocolMessage(),
    createdAt: new Date().toISOString(),
    metadata: { test: true },
});

const createTransport = (
    id: TransportId,
    options: { readonly failStart?: boolean } = {},
): Transport => {
    let status: Transport["status"] = "idle";
    const snapshot = (): TransportSnapshot => ({ id, status });

    return {
        id,
        get status() {
            return status;
        },
        async start() {
            if (options.failStart) {
                status = "failed";
                return {
                    success: false,
                    error: {
                        code: "transport-error" as const,
                        message: "Start failed",
                    },
                };
            }
            status = "listening";
            return { success: true, data: snapshot() };
        },
        async stop() {
            status = "stopped";
            return { success: true, data: snapshot() };
        },
        async send(envelope: OutboundMessageEnvelope) {
            const receipt: DeliveryReceipt = {
                delivered: true,
                timestamp: new Date().toISOString(),
                transportId: envelope.transportId,
                connectionId: envelope.connectionId,
            };
            return { success: true, data: receipt };
        },
        onMessage() {
            return () => undefined;
        },
        snapshot,
    };
};

describe("transport module", () => {
    describe("createTransportRegistry", () => {
        it("should fail when registering duplicate transports", () => {
            const transport = createMemoryTransport("transport:memory");
            const registry = createTransportRegistry([transport]);

            const result = registry.register(transport);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("conflict");
                expect(result.error.message).toContain("transport:memory");
            }
        });

        it("should start all transports", async () => {
            const first = createTransport("transport:first");
            const second = createTransport("transport:second");
            const registry = createTransportRegistry([first, second]);

            const result = await registry.startAll();

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toHaveLength(2);
                expect(result.data.map((item) => item.status)).toEqual([
                    "listening",
                    "listening",
                ]);
            }
            expect(first.status).toBe("listening");
            expect(second.status).toBe("listening");
        });

        it("should return failure if one transport start fails", async () => {
            const first = createTransport("transport:first");
            const second = createTransport("transport:second", {
                failStart: true,
            });
            const registry = createTransportRegistry([first, second]);

            const result = await registry.startAll();

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("transport-error");
                expect(result.error.message).toContain("transport:second");
            }
        });

        it("should stop all transports", async () => {
            const first = createTransport("transport:first");
            const second = createTransport("transport:second");
            const registry = createTransportRegistry([first, second]);

            await registry.startAll();
            const result = await registry.stopAll();

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.map((item) => item.status)).toEqual([
                    "stopped",
                    "stopped",
                ]);
            }
        });
    });

    describe("createMemoryTransport", () => {
        it("should send with a delivery receipt", async () => {
            const transport = createMemoryTransport("transport:memory");
            await transport.start();

            const result = await transport.send(
                createOutboundEnvelope("transport:memory"),
            );

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.delivered).toBe(true);
                expect(result.data.transportId).toBe("transport:memory");
                expect(result.data.connectionId).toBe("conn:test");
            }
        });

        it("should emit sent protocol messages to listeners", async () => {
            const transport = createMemoryTransport("transport:memory");
            const listener = vi.fn<(envelope: TransportEnvelope) => void>();
            transport.onMessage(listener);
            await transport.start();

            const outbound = createOutboundEnvelope("transport:memory");
            await transport.send(outbound);

            expect(listener).toHaveBeenCalledTimes(1);
            const received = listener.mock.calls[0][0];
            expect(received.transportId).toBe("transport:memory");
            expect(received.connectionId).toBe("conn:test");
            expect(received.message).toBe(outbound.payload);
            expect(received.metadata).toEqual({ test: true });
        });

        it("should not emit to unsubscribed listeners", async () => {
            const transport = createMemoryTransport("transport:memory");
            const listener = vi.fn<(envelope: TransportEnvelope) => void>();
            const unsubscribe = transport.onMessage(listener);
            await transport.start();

            unsubscribe();
            await transport.send(createOutboundEnvelope("transport:memory"));

            expect(listener).not.toHaveBeenCalled();
        });
    });
});
