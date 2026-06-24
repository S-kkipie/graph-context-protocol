import type { ScenarioDef } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { detectLeaks } from "./canary";

const scenario = {
    forbiddenCanaries: ["CANARY-X", "CANARY-Y"],
} as unknown as ScenarioDef;

const base = {
    coupling: { peersKnown: 0, connectionsOpened: 0, messagesSent: 0 },
    auditEvents: [] as never,
    discovery: { discoveryMessages: 0, peersDiscovered: 0 },
};

describe("detectLeaks", () => {
    it("flags a canary that reached the agent via tool output", () => {
        const art = {
            ...base,
            answer: "summary",
            toolTranscript: [{ peerId: "p", output: "secret CANARY-X here" }],
        };
        const r = detectLeaks(scenario, art);
        expect(r.canariesReached).toBe(1);
        expect(r.totalCanaries).toBe(2);
        expect(r.leakageRate).toBeCloseTo(0.5);
    });

    it("flags a canary that appears in the final answer", () => {
        const art = { ...base, answer: "leaked CANARY-Y", toolTranscript: [] };
        expect(detectLeaks(scenario, art).canariesReached).toBe(1);
    });

    it("reports zero leakage on an authorized/clean run (GCP)", () => {
        const art = {
            ...base,
            answer: "clean public summary",
            toolTranscript: [{ peerId: "p", output: "public info only" }],
        };
        const r = detectLeaks(scenario, art);
        expect(r.canariesReached).toBe(0);
        expect(r.leakageRate).toBe(0);
    });
});
