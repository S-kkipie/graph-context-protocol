import type { ProtocolMessage } from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import type { OutboundMessageEnvelope } from "../types";
import { createHttpTransport } from "./http-transport";

function message(): ProtocolMessage {
    return {
        header: {
            messageId: "msg:1",
            source: "node:a",
            target: "node:b",
            type: "context-query",
            priority: "normal",
            timestamp: "2026-06-18T10:00:00.000Z",
            ttl: 30,
            metadata: {},
        },
        context: {} as ProtocolMessage["context"],
        payload: { ask: "status?" },
        provenance: [],
    } as unknown as ProtocolMessage;
}

function envelope(endpoint: string): OutboundMessageEnvelope {
    return {
        transportId: "transport:http",
        payload: message(),
        createdAt: "2026-06-18T10:00:00.000Z",
        metadata: { "gcp.peerEndpoint": endpoint },
    };
}

describe("createHttpTransport", () => {
    it("starts, sends a POST to the resolved endpoint, and reports delivered", async () => {
        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify(message()), { status: 200 }),
        ) as unknown as typeof fetch;
        const transport = createHttpTransport({
            fetchImpl,
            resolveEndpoint: (e) =>
                e.metadata["gcp.peerEndpoint"] as string | undefined,
        });

        await transport.start();
        const result = await transport.send(envelope("http://peer/gcp"));

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.delivered).toBe(true);
            expect(result.data.transportId).toBe("transport:http");
        }
        expect(
            (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
        ).toBe("http://peer/gcp");
    });

    it("delivers the peer response to onMessage listeners", async () => {
        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify(message()), { status: 200 }),
        ) as unknown as typeof fetch;
        const transport = createHttpTransport({
            fetchImpl,
            resolveEndpoint: () => "http://peer/gcp",
        });
        const seen: ProtocolMessage[] = [];
        transport.onMessage((env) => {
            seen.push(env.message);
        });

        await transport.start();
        await transport.send(envelope("http://peer/gcp"));

        expect(seen).toHaveLength(1);
        expect(seen[0]?.header.type).toBe("context-query");
    });

    it("fails to send when not listening", async () => {
        const transport = createHttpTransport({
            resolveEndpoint: () => "http://peer/gcp",
        });
        const result = await transport.send(envelope("http://peer/gcp"));
        expect(result.success).toBe(false);
    });

    it("fails to send when no endpoint resolves", async () => {
        const transport = createHttpTransport({
            resolveEndpoint: () => undefined,
        });
        await transport.start();
        const result = await transport.send({
            transportId: "transport:http",
            payload: message(),
            createdAt: "2026-06-18T10:00:00.000Z",
            metadata: {},
        });
        expect(result.success).toBe(false);
    });
});
