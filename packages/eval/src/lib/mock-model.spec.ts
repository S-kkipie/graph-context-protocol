import {
    createCouplingMetrics,
    createTaskAgent,
    type PeerContextToolFactory,
    type PeerRef,
    runTaskAgent,
} from "@graph-context-protocol/agent-core";
import { tool } from "@langchain/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockChatModel } from "./mock-model";

const schema = z.object({ question: z.string() });
const factory: PeerContextToolFactory = (peer: PeerRef, metrics) => {
    metrics.recordPeerContacted(peer.peerId);
    return tool(
        async () => {
            metrics.recordMessageSent();
            return `answer from ${peer.peerId}`;
        },
        { name: "query_peer_context", description: "d", schema },
    );
};

describe("createMockChatModel", () => {
    it("drives a react agent through one tool call per peer then answers", async () => {
        const metrics = createCouplingMetrics();
        const agent = createTaskAgent({
            model: createMockChatModel({
                finalAnswer: "cheapest is s1 at $10",
            }),
            llm: {},
            systemPrompt: "t",
            peers: [
                { peerId: "p1", targetNodeId: "k1", endpoint: "x" },
                { peerId: "p2", targetNodeId: "k2", endpoint: "y" },
            ],
            toolFactory: factory,
            metrics,
        });
        const answer = await runTaskAgent(agent, "go");
        expect(answer).toContain("cheapest is s1 at $10");
        expect(metrics.snapshot().messagesSent).toBe(2);
        expect(metrics.snapshot().connectionsOpened).toBe(2);
    });
});
