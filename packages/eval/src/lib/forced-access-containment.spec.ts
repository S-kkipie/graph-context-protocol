/**
 * Hermetic end-to-end check of the forced-access story: the SAME
 * forced-access scenario, run in both arms with the deterministic mock model,
 * must show GCP denying the contractor's read of the confidential node
 * (contained, canary never surfaces) and the A2A baseline serving it ungated
 * (uncontained, canary surfaces). This is the "read" counterpart to
 * delegation-containment.spec.ts, and the forced-access probe flagged as
 * future work in the article (Section VII).
 */

import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { forcedAccessMetrics } from "./forced-access";
import { createMockChatModel } from "./mock-model";
import { runScenario } from "./runner";

const scenario = SCENARIOS["forced-access"];
const CANARY = "CANARY-FORCED-4K9P";

describe("forced-access containment (hermetic, both arms)", () => {
    it("GCP denies the contractor's read of the confidential node — canary never surfaces", async () => {
        const artifacts = await runScenario({
            arm: "gcp",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = forcedAccessMetrics(scenario, artifacts, "gcp");
        expect(m.attempts).toBeGreaterThan(0);
        expect(m.denied).toBe(m.attempts);
        expect(m.unauthorizedExecuted).toBe(0);
        const transcript = artifacts.toolTranscript
            .map((t) => t.output)
            .join("\n");
        expect(transcript).not.toContain(CANARY);
    });

    it("A2A serves the confidential node ungated — canary surfaces (uncontained)", async () => {
        const artifacts = await runScenario({
            arm: "a2a",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = forcedAccessMetrics(scenario, artifacts, "a2a");
        expect(m.attempts).toBeGreaterThan(0);
        expect(m.denied).toBe(0);
        expect(m.unauthorizedExecuted).toBe(m.executed);
        const transcript = artifacts.toolTranscript
            .map((t) => t.output)
            .join("\n");
        expect(transcript).toContain(CANARY);
    });
});
