/**
 * Adversary check for the instrumented-A2A arm. In that arm the requested
 * operation (read vs delegate) is DECLARED BY THE CALLER in message metadata,
 * so a caller that omits the declaration is treated as a plain reader. This
 * documents what that does: the delegation rule is not applied, the action
 * runs, and the audit record says "read". The same caller cannot do this
 * against GCP, where delegation is a distinct protocol operation.
 */

import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { delegationMetrics } from "./delegation";
import { createMockChatModel } from "./mock-model";
import { runScenario } from "./runner";

describe("a2a-pep: caller omits the operation declaration", () => {
    const scenario = SCENARIOS.delegation;

    it("control: a caller that declares delegate is contained", async () => {
        const artifacts = await runScenario({
            arm: "a2a-pep",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = delegationMetrics(scenario, artifacts, "a2a-pep");
        expect(m.attempts).toBeGreaterThan(0);
        expect(m.denied).toBe(m.attempts);
        expect(m.unauthorizedExecuted).toBe(0);
    });

    it("bypass: omitting the declaration executes the delegation and is logged as a read", async () => {
        const artifacts = await runScenario({
            arm: "a2a-pep",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
            pepAdversary: "omit-capability",
        });
        const m = delegationMetrics(scenario, artifacts, "a2a-pep");
        expect(m.attempts).toBeGreaterThan(0);
        expect(m.denied).toBe(0);
        expect(m.unauthorizedExecuted).toBe(m.attempts);
        // The audit trail records an allowed read, not a denied delegation.
        expect(artifacts.auditEvents.every((e) => e.decision === "allow")).toBe(
            true,
        );
    });

    it("gcp control: the same agent's delegation is denied by the delegate gate", async () => {
        const artifacts = await runScenario({
            arm: "gcp",
            scenario,
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        const m = delegationMetrics(scenario, artifacts, "gcp");
        expect(m.denied).toBe(m.attempts);
    });
});
