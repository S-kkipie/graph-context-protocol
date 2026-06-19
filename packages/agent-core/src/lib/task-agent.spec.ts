import { type StructuredTool, tool } from "@langchain/core/tools";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCouplingMetrics } from "./metrics";
import { createTaskAgent } from "./task-agent";
import type { PeerContextToolFactory, PeerRef } from "./types";

const InputSchema = z.object({ question: z.string() });

function fakeToolFactory(): {
    factory: PeerContextToolFactory;
    calls: PeerRef[];
} {
    const calls: PeerRef[] = [];
    const factory: PeerContextToolFactory = (peer): StructuredTool => {
        calls.push(peer);
        return tool(async () => "stub", {
            name: "query_peer_context",
            description: "stub",
            schema: InputSchema,
        });
    };
    return { factory, calls };
}

describe("createTaskAgent", () => {
    it("builds one tool per peer and records peers known", () => {
        const { factory, calls } = fakeToolFactory();
        const metrics = createCouplingMetrics();
        const setPeersKnown = vi.spyOn(metrics, "setPeersKnown");
        const peers: PeerRef[] = [
            { peerId: "p:1", targetNodeId: "k:1", endpoint: "http://a" },
            { peerId: "p:2", targetNodeId: "k:2", endpoint: "http://b" },
        ];

        const agent = createTaskAgent({
            llm: { apiKey: "test-key" },
            systemPrompt: "you are a test agent",
            peers,
            toolFactory: factory,
            metrics,
        });

        expect(agent).toBeTruthy();
        expect(calls).toHaveLength(2);
        expect(calls.map((c) => c.peerId)).toEqual(["p:1", "p:2"]);
        expect(setPeersKnown).toHaveBeenCalledWith(2);
    });
});
