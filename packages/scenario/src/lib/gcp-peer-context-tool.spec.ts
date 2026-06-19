import {
    createCouplingMetrics,
    type PeerRef,
} from "@graph-context-protocol/agent-core";
import type { queryRemoteContext } from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpPeerContextToolFactory } from "./gcp-peer-context-tool";

const peer: PeerRef = {
    peerId: "peer:exec",
    targetNodeId: "knowledge:executor-context",
    endpoint: "http://exec/gcp",
};

describe("createGcpPeerContextToolFactory", () => {
    it("records coupling metrics and returns the peer's context on ok", async () => {
        const fakeQuery: typeof queryRemoteContext = async () =>
            ({
                queryId: "q:1",
                status: "ok",
                sourceNodeId: "node:exec",
                result: "remote answer",
            }) as Awaited<ReturnType<typeof queryRemoteContext>>;
        const metrics = createCouplingMetrics();
        const factory = createGcpPeerContextToolFactory({ queryFn: fakeQuery });
        const tool = factory(peer, metrics);

        const out = await tool.invoke({ question: "status?" });

        expect(out).toBe("remote answer");
        const snap = metrics.snapshot();
        expect(snap.connectionsOpened).toBe(1);
        expect(snap.messagesSent).toBe(1);
    });

    it("returns a fail-soft string when the peer is unreachable", async () => {
        const fakeQuery: typeof queryRemoteContext = async () => {
            throw new Error("boom");
        };
        const metrics = createCouplingMetrics();
        const factory = createGcpPeerContextToolFactory({ queryFn: fakeQuery });
        const tool = factory(peer, metrics);

        const out = await tool.invoke({ question: "status?" });

        expect(out).toContain("Failed to reach peer node");
        expect(out).toContain("boom");
    });
});
