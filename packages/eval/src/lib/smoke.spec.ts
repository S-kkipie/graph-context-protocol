import {
    marketplaceScenario,
    SCENARIOS,
} from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { createMockChatModel } from "./mock-model";
import { collectResult } from "./run-eval";

describe("hermetic eval smoke (mock LLM)", () => {
    it("marketplace: both arms complete and produce metrics", async () => {
        const scenario = marketplaceScenario(2);
        // cheapest is the last seller (s1) at $10 per marketplaceScenario rules
        const model = createMockChatModel({
            finalAnswer: "cheapest is s1 at $10",
        });
        for (const arm of ["gcp", "a2a"] as const) {
            const r = await collectResult({
                scenario,
                arm,
                n: 2,
                seed: 1,
                model,
            });
            expect(r.behavioral.messages).toBe(2);
            expect(r.behavioral.taskSuccess).toBe(true);
            expect(r.structural.pairwiseConnections).toBe(
                arm === "a2a" ? 2 : 2,
            );
        }
    });

    it("software-org: GCP denies the canary, A2A leaks it", async () => {
        const scenario = SCENARIOS["software-org"];
        const model = createMockChatModel({
            finalAnswer: "Aurora public summary, release 2.1.0",
        });
        const gcp = await collectResult({
            scenario,
            arm: "gcp",
            n: 2,
            seed: 1,
            model,
        });
        const a2a = await collectResult({
            scenario,
            arm: "a2a",
            n: 2,
            seed: 1,
            model,
        });
        // GCP role-gating denies the under-privileged read → no canary reaches the agent.
        expect(gcp.leakage.canariesReached).toBe(0);
        // A2A coarse card exposes the confidential node → canary leaks via tool I/O.
        expect(a2a.leakage.canariesReached).toBeGreaterThan(0);
        // GCP audited its read decisions; A2A did not.
        expect(gcp.provenance).toBeGreaterThan(0);
        expect(a2a.provenance).toBe(0);
    });
});
