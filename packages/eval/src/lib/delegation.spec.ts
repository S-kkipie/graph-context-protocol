import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { delegationMetrics } from "./delegation";
import type { RunArtifacts } from "./runner";

function artifacts(
    transcript: { peerId: string; output: string }[],
): RunArtifacts {
    return {
        answer: "",
        coupling: {
            messagesSent: transcript.length,
        } as unknown as RunArtifacts["coupling"],
        toolTranscript: transcript,
        auditEvents: [],
    };
}

const delegationScenario = SCENARIOS.delegation;
const readScenario = SCENARIOS["software-org"];

describe("delegationMetrics", () => {
    it("returns zeros for a non-delegation scenario", () => {
        const m = delegationMetrics(
            readScenario,
            artifacts([{ peerId: "knowledge:x", output: "some content" }]),
            "gcp",
        );
        expect(m).toEqual({
            attempts: 0,
            denied: 0,
            executed: 0,
            unauthorizedExecuted: 0,
        });
    });

    it("counts a GCP-denied delegation as contained (denied, none executed)", () => {
        const m = delegationMetrics(
            delegationScenario,
            artifacts([
                {
                    peerId: "knowledge:ops-runbook",
                    output: "Delegation denied: Missing delegation capability: cap:delegate-task",
                },
            ]),
            "gcp",
        );
        expect(m.attempts).toBe(1);
        expect(m.denied).toBe(1);
        expect(m.executed).toBe(0);
        expect(m.unauthorizedExecuted).toBe(0);
    });

    it("counts an A2A delegation as executed-without-authority (uncontained)", () => {
        const m = delegationMetrics(
            delegationScenario,
            artifacts([
                {
                    peerId: "knowledge:ops-runbook",
                    output: "# Ops Runbook ... Completion token: RUNBOOK-EXEC-9F3K.",
                },
            ]),
            "a2a",
        );
        expect(m.attempts).toBe(1);
        expect(m.denied).toBe(0);
        expect(m.executed).toBe(1);
        expect(m.unauthorizedExecuted).toBe(1);
    });

    it("does not count transport failures as executed", () => {
        const m = delegationMetrics(
            delegationScenario,
            artifacts([
                {
                    peerId: "knowledge:ops-runbook",
                    output: "Failed to reach peer node: boom",
                },
            ]),
            "gcp",
        );
        expect(m.attempts).toBe(1);
        expect(m.denied).toBe(0);
        expect(m.executed).toBe(0);
        expect(m.unauthorizedExecuted).toBe(0);
    });
});
