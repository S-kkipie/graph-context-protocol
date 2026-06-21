import {
    createDelegationRequest,
    createDelegationResult,
    createMessageHeader,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { delegateRemoteTask } from "./delegation-client";

function buildRequest() {
    const requester = createRequesterDescriptor("principal:test", [], []);
    return createDelegationRequest(
        "deleg:1",
        requester,
        "knowledge:peer",
        "summarize the incident",
    );
}

function fakeResponseMessage() {
    const result = createDelegationResult(
        "deleg:1",
        "completed",
        "node:peer",
        {},
        "incident summarized",
    );
    const header = createMessageHeader(
        "msg:deleg:1:response",
        "node:peer",
        "node:client",
        "action-response",
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

describe("delegateRemoteTask", () => {
    it("posts an action-request message and returns the delegation result payload", async () => {
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

        const result = await delegateRemoteTask({
            url: "http://peer.test/api/gcp",
            request: buildRequest(),
            credentials: { type: "token", value: "tok:agent" },
            fetchImpl,
        });

        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("http://peer.test/api/gcp");
        expect(init?.method).toBe("POST");
        const sentBody = JSON.parse(init?.body as string);
        expect(sentBody.header.type).toBe("action-request");
        expect(sentBody.payload.task).toBe("summarize the incident");
        expect(sentBody.header.metadata["gcp.credentials"]).toEqual({
            type: "token",
            value: "tok:agent",
        });
        expect(result.status).toBe("completed");
        expect(result.result).toBe("incident summarized");
    });

    it("defaults to anonymous credentials when none provided", async () => {
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

        await delegateRemoteTask({
            url: "http://peer.test/api/gcp",
            request: buildRequest(),
            fetchImpl,
        });

        const init = fetchImpl.mock.calls[0][1];
        const sentBody = JSON.parse(init?.body as string);
        expect(sentBody.header.metadata["gcp.credentials"]).toEqual({
            type: "anonymous",
            value: "anonymous",
        });
    });
});
