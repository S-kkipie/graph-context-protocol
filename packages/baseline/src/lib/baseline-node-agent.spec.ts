import {
    type AgentNodeDef,
    createCouplingMetrics,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import { afterEach, describe, expect, it } from "vitest";
import { type BaselineNodeHandle, createBaselineNode } from "./baseline-node";

const agentNode: AgentNodeDef = {
    nodeId: "agent:buyer",
    role: "role:buyer",
    systemPrompt: "you are a buyer",
    goal: "find the cheapest",
    peers: ["knowledge:seller-gamma"],
};

let handles: BaselineNodeHandle[] = [];
afterEach(async () => {
    await Promise.all(handles.map((h) => h.close()));
    handles = [];
});

describe("createBaselineNode (agent node)", () => {
    it("boots an agent server and serves its card without calling the LLM", async () => {
        const h = await createBaselineNode(agentNode, {
            metrics: createCouplingMetrics(),
            llm: { apiKey: "test-key" },
            peerEndpoints: { "knowledge:seller-gamma": "http://127.0.0.1:9" },
        });
        handles.push(h);
        const res = await fetch(`${h.url}/.well-known/agent-card.json`);
        expect(res.ok).toBe(true);
        const card = (await res.json()) as {
            name: string;
            skills: Array<{ id: string }>;
        };
        expect(card.name).toBe("agent:buyer");
        expect(card.skills.map((s) => s.id)).toContain(PROVIDE_CONTEXT_SKILL);
    });
});
