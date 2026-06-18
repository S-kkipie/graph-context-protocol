import type { ProtocolMessage } from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { postProtocolMessage } from "./post-message";

const message = {
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
    payload: { hello: "world" },
    provenance: [],
} as unknown as ProtocolMessage;

describe("postProtocolMessage", () => {
    it("POSTs the message as JSON and returns the parsed response message", async () => {
        const responseMessage = { ...message, payload: { answer: 42 } };
        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify(responseMessage), { status: 200 }),
        ) as unknown as typeof fetch;

        const result = await postProtocolMessage(
            "http://peer/gcp",
            message,
            fetchImpl,
        );

        expect(result.payload).toEqual({ answer: 42 });
        const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>)
            .mock.calls[0];
        expect(url).toBe("http://peer/gcp");
        expect((init as RequestInit).method).toBe("POST");
        expect(JSON.parse((init as RequestInit).body as string)).toEqual(
            message,
        );
    });

    it("throws on a non-OK response", async () => {
        const fetchImpl = vi.fn(
            async () =>
                new Response("nope", {
                    status: 502,
                    statusText: "Bad Gateway",
                }),
        ) as unknown as typeof fetch;

        await expect(
            postProtocolMessage("http://peer/gcp", message, fetchImpl),
        ).rejects.toThrow(/502/);
    });
});
