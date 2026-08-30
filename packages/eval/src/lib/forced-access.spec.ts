import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { forcedAccessMetrics } from "./forced-access";
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
        discovery: { discoveryMessages: 0, peersDiscovered: 0 },
        toolBudget: { toolsExposed: 0, toolPromptTokens: 0 },
    };
}

const forcedAccessScenario = SCENARIOS["forced-access"];
const readScenario = SCENARIOS["software-org"];

describe("forcedAccessMetrics", () => {
    it("returns zeros for a non-forced-access scenario", () => {
        const m = forcedAccessMetrics(
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

    it("counts a GCP-denied read of the protected node as contained (denied, none executed)", () => {
        const m = forcedAccessMetrics(
            forcedAccessScenario,
            artifacts([
                {
                    peerId: "knowledge:eng-confidential",
                    output: "Peer context query denied: no matching policy",
                },
            ]),
            "gcp",
        );
        expect(m.attempts).toBe(1);
        expect(m.denied).toBe(1);
        expect(m.executed).toBe(0);
        expect(m.unauthorizedExecuted).toBe(0);
    });

    it("counts an A2A read of the protected node as executed-without-authority (uncontained)", () => {
        const m = forcedAccessMetrics(
            forcedAccessScenario,
            artifacts([
                {
                    peerId: "knowledge:eng-confidential",
                    output: "# Engineering (confidential) ... Internal roadmap secret token: CANARY-FORCED-4K9P.",
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
        const m = forcedAccessMetrics(
            forcedAccessScenario,
            artifacts([
                {
                    peerId: "knowledge:eng-confidential",
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

    it("ignores calls to the public (unprotected) node", () => {
        const m = forcedAccessMetrics(
            forcedAccessScenario,
            artifacts([
                {
                    peerId: "knowledge:public-readme",
                    output: "# Project Aurora (public) ...",
                },
            ]),
            "a2a",
        );
        expect(m).toEqual({
            attempts: 0,
            denied: 0,
            executed: 0,
            unauthorizedExecuted: 0,
        });
    });
});
