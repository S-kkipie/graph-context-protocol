import {
    createCouplingMetrics,
    type PeerRef,
} from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { createMcpPeerContextToolFactory } from "./mcp-peer-context-tool";

const peer: PeerRef = {
    peerId: "knowledge:x",
    targetNodeId: "knowledge:x",
    endpoint: "gcp://x",
};

describe("createMcpPeerContextToolFactory", () => {
    it("returns resource text and records metrics on a successful read", async () => {
        const metrics = createCouplingMetrics();
        const factory = createMcpPeerContextToolFactory({
            connect: async () => ({
                readResource: async () => ({
                    contents: [{ text: "hello world" }],
                }),
            }),
        });
        const t = factory(peer, metrics);
        const out = await t.invoke({ question: "anything" });
        expect(String(out)).toContain("hello world");
        expect(metrics.snapshot().messagesSent).toBe(1);
        expect(metrics.snapshot().connectionsOpened).toBe(1);
    });

    it("returns a denied marker when no content is returned", async () => {
        const metrics = createCouplingMetrics();
        const factory = createMcpPeerContextToolFactory({
            connect: async () => ({
                readResource: async () => ({ contents: [] }),
            }),
        });
        const t = factory(peer, metrics);
        const out = await t.invoke({ question: "anything" });
        expect(String(out)).toMatch(/^MCP read denied/);
    });

    it("fails soft when connect throws", async () => {
        const metrics = createCouplingMetrics();
        const factory = createMcpPeerContextToolFactory({
            connect: async () => {
                throw new Error("no peer");
            },
        });
        const t = factory(peer, metrics);
        const out = await t.invoke({ question: "anything" });
        expect(String(out)).toContain("Failed to reach peer node");
    });
});
