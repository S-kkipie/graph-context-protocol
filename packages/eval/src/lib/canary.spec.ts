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
    toolBudget: { toolsExposed: 0, toolPromptTokens: 0 },
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

describe("detectLeaks (semantic patterns)", () => {
    const sem = {
        forbiddenCanaries: ["CANARY-X"],
        forbiddenPatterns: [/4\.2\s*(m\b|million)/i, /\bfalcon\b/i],
    } as unknown as ScenarioDef;

    it("catches a paraphrased disclosure the exact canary misses", () => {
        const art = {
            ...base,
            answer: "The budget is about 4.2M and codenamed Falcon.",
            toolTranscript: [],
        };
        const r = detectLeaks(sem, art);
        expect(r.totalCanaries).toBe(3);
        expect(r.canariesReached).toBe(2);
        expect(r.answerReached).toBe(2);
        expect(r.transcriptReached).toBe(0);
    });

    it("separates transcript-only from answer leakage", () => {
        const art = {
            ...base,
            answer: "I could not retrieve the budget.",
            toolTranscript: [{ peerId: "p", output: "budget 4.2 million" }],
        };
        const r = detectLeaks(sem, art);
        expect(r.transcriptReached).toBe(1);
        expect(r.answerReached).toBe(0);
    });
});
