import {
    createCouplingMetrics,
    type KnowledgeNodeDef,
    type PeerRef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import { afterEach, describe, expect, it } from "vitest";
import { createA2aPeerContextToolFactory } from "./a2a-peer-context-tool";
import { type BaselineNodeHandle, createBaselineNode } from "./baseline-node";

const node: KnowledgeNodeDef = {
    nodeId: "knowledge:seller-gamma",
    content: "# Seller gamma\n\nWidgetPro $12.",
    tags: ["offer"],
    readableByRoles: ["role:buyer"],
    exposedSkills: [PROVIDE_CONTEXT_SKILL],
};

let handles: BaselineNodeHandle[] = [];
afterEach(async () => {
    await Promise.all(handles.map((h) => h.close()));
    handles = [];
});

describe("createA2aPeerContextToolFactory", () => {
    it("sends an A2A message and records coupling metrics", async () => {
        const h = await createBaselineNode(node);
        handles.push(h);
        const peer: PeerRef = {
            peerId: "peer:gamma",
            targetNodeId: "knowledge:seller-gamma",
            endpoint: h.url,
        };
        const metrics = createCouplingMetrics();
        const tool = createA2aPeerContextToolFactory()(peer, metrics);

        const out = await tool.invoke({ question: "price?" });

        expect(out).toContain("$12");
        const snap = metrics.snapshot();
        expect(snap.connectionsOpened).toBe(1);
        expect(snap.messagesSent).toBe(1);
    });

    it("returns a fail-soft string when the peer is unreachable", async () => {
        const peer: PeerRef = {
            peerId: "peer:dead",
            targetNodeId: "knowledge:dead",
            endpoint: "http://127.0.0.1:1",
        };
        const metrics = createCouplingMetrics();
        const tool = createA2aPeerContextToolFactory()(peer, metrics);

        const out = await tool.invoke({ question: "hi" });

        expect(out.toLowerCase()).toContain("failed to reach peer");
        expect(metrics.snapshot().messagesSent).toBe(1);
    });
});
