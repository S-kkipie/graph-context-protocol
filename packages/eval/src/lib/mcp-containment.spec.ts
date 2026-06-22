/**
 * Hermetic end-to-end check of the MCP governance story: the SAME mcp-interop
 * scenario, run in both MCP arms with the deterministic mock model, must show
 * GCP-over-MCP denying the under-privileged read (contained — canary never
 * surfaces) and the vanilla raw-MCP server leaking it (uncontained).
 */

import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { interopMetrics } from "./interop";
import { runMcpScenario } from "./mcp-runner";
import { createMockChatModel } from "./mock-model";

const scenario = SCENARIOS["mcp-interop"];
const CANARY = "MCP-LEAK-7Q2X";

describe("mcp-interop containment (hermetic, both arms)", () => {
    it("GCP-over-MCP denies the under-privileged read — canary never surfaces", async () => {
        const artifacts = await runMcpScenario({
            arm: "gcp-mcp",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = interopMetrics(scenario, artifacts);
        expect(m.mcpReadsServed).toBeGreaterThan(0);
        expect(m.deniedOverMcp).toBe(m.mcpReadsServed);
        expect(m.leakedOverMcp).toBe(0);
        const transcript = artifacts.toolTranscript
            .map((t) => t.output)
            .join("\n");
        expect(transcript).not.toContain(CANARY);
    });

    it("raw-MCP serves the read ungated — canary leaks (uncontained)", async () => {
        const artifacts = await runMcpScenario({
            arm: "raw-mcp",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = interopMetrics(scenario, artifacts);
        expect(m.mcpReadsServed).toBeGreaterThan(0);
        expect(m.deniedOverMcp).toBe(0);
        expect(m.leakedOverMcp).toBeGreaterThan(0);
        const transcript = artifacts.toolTranscript
            .map((t) => t.output)
            .join("\n");
        expect(transcript).toContain(CANARY);
    });
});
