import {
    createContextQuery,
    createContextQueryResult,
    createMessageHeader,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { queryRemoteContext } from "./fetch-client";

function buildQuery() {
    const requester = createRequesterDescriptor("principal:test", [], []);
    return createContextQuery(
        "query:1",
        requester,
        "knowledge:peer",
        "text",
        "what happened today?",
    );
}

function fakeResponseMessage() {
    const result = createContextQueryResult(
        "query:1",
        "ok",
        "knowledge:peer",
        {},
        "TODAY: shipped feature X",
    );
    const header = createMessageHeader(
        "msg:1:response",
        "node:peer",
        "node:client",
        "context-query-response",
    );
    const ctx = {
        id: "ctx:1",
        graphId: "graph:x",
        currentNode: "node:peer",
        accumulatedData: {},
        role: createRole("role:x", "X", ""),
        metadata: {},
        createdAt: "2026-06-02T00:00:00.000Z",
        path: [],
    };
    return createProtocolMessage(header, ctx, result);
}

describe("queryRemoteContext", () => {
    it("posts a context-query message and returns the response payload", async () => {
        const fetchImpl = vi.fn(
            async (
                _url: Parameters<typeof fetch>[0],
                _init?: Parameters<typeof fetch>[1],
            ) =>
                new Response(JSON.stringify(fakeResponseMessage()), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const result = await queryRemoteContext({
            url: "http://peer.test/api/gcp",
            query: buildQuery(),
            fetchImpl,
        });

        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("http://peer.test/api/gcp");
        expect(init?.method).toBe("POST");
        const sentBody = JSON.parse(init?.body as string);
        expect(sentBody.header.type).toBe("context-query");
        expect(sentBody.header.metadata["gcp.credentials"]).toEqual({
            type: "anonymous",
            value: "anonymous",
        });
        expect(result.status).toBe("ok");
        expect(result.result).toBe("TODAY: shipped feature X");
    });
});
