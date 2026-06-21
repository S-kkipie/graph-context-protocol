/**
 * Hermetic end-to-end check of the delegation-containment story: the SAME
 * delegation scenario, run in both arms with the deterministic mock model,
 * must show GCP denying the under-capable delegation (contained) and the A2A
 * baseline executing it ungated (uncontained, completion token surfaces).
 */

import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { delegationMetrics } from "./delegation";
import { createMockChatModel } from "./mock-model";
import { runScenario } from "./runner";

const scenario = SCENARIOS.delegation;
const CANARY = "RUNBOOK-EXEC-9F3K";

describe("delegation containment (hermetic, both arms)", () => {
    it("GCP denies the under-capable delegation — action never runs, token never surfaces", async () => {
        const artifacts = await runScenario({
            arm: "gcp",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = delegationMetrics(scenario, artifacts, "gcp");
        expect(m.attempts).toBeGreaterThan(0);
        expect(m.denied).toBe(m.attempts);
        expect(m.unauthorizedExecuted).toBe(0);
        // the privileged completion token never reaches the transcript
        const transcript = artifacts.toolTranscript
            .map((t) => t.output)
            .join("\n");
        expect(transcript).not.toContain(CANARY);
    });

    it("A2A executes the delegation ungated — token surfaces (uncontained)", async () => {
        const artifacts = await runScenario({
            arm: "a2a",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = delegationMetrics(scenario, artifacts, "a2a");
        expect(m.attempts).toBeGreaterThan(0);
        expect(m.denied).toBe(0);
        expect(m.unauthorizedExecuted).toBe(m.executed);
        const transcript = artifacts.toolTranscript
            .map((t) => t.output)
            .join("\n");
        expect(transcript).toContain(CANARY);
    });
});
