import type { ScenarioDef } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { interopMetrics } from "./interop";
import type { RunArtifacts } from "./runner";

const scenario = {
    id: "mcp-interop",
    knowledgeNodes: [],
    agent: { nodeId: "a", role: "role:auditor", systemPrompt: "", goal: "", peers: ["p"] },
    succeeded: () => false,
    forbiddenCanaries: ["MCP-LEAK-7Q2X"],
} as unknown as ScenarioDef;

const artifacts = (outputs: string[]): RunArtifacts => ({
    answer: "",
    coupling: { peersKnown: 1, connectionsOpened: 1, messagesSent: outputs.length },
    toolTranscript: outputs.map((output) => ({ peerId: "p", output })),
    auditEvents: [],
});

describe("interopMetrics", () => {
    it("counts a denied GCP-over-MCP read as contained (no leak)", () => {
        const m = interopMetrics(
            scenario,
            artifacts(["MCP read denied: no content returned"]),
        );
        expect(m.mcpReadsServed).toBe(1);
        expect(m.deniedOverMcp).toBe(1);
        expect(m.leakedOverMcp).toBe(0);
    });

    it("counts a raw-MCP read surfacing the canary as a leak", () => {
        const m = interopMetrics(
            scenario,
            artifacts(["Incident Log ... token: MCP-LEAK-7Q2X."]),
        );
        expect(m.mcpReadsServed).toBe(1);
        expect(m.deniedOverMcp).toBe(0);
        expect(m.leakedOverMcp).toBe(1);
    });
});
