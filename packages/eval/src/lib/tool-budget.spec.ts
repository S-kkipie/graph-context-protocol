import type { PeerRef } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { measureToolBudget } from "./tool-budget";

const peers = (count: number): PeerRef[] =>
    Array.from({ length: count }, (_v, i) => ({
        peerId: `knowledge:seller-s${i}`,
        targetNodeId: `knowledge:seller-s${i}`,
        endpoint: `http://gcp/seller-s${i}`,
    }));

describe("measureToolBudget", () => {
    it("GCP exposes exactly ONE tool at any N (O(1))", () => {
        expect(measureToolBudget("gcp", peers(2)).toolsExposed).toBe(1);
        expect(measureToolBudget("gcp", peers(32)).toolsExposed).toBe(1);
    });

    it("A2A exposes one tool per peer (O(N))", () => {
        expect(measureToolBudget("a2a", peers(2)).toolsExposed).toBe(2);
        expect(measureToolBudget("a2a", peers(32)).toolsExposed).toBe(32);
    });

    it("GCP prompt-token budget is flat across N; A2A grows with N", () => {
        const g2 = measureToolBudget("gcp", peers(2)).toolPromptTokens;
        const g32 = measureToolBudget("gcp", peers(32)).toolPromptTokens;
        expect(g2).toBe(g32); // one tool, identical schema → constant

        const a2 = measureToolBudget("a2a", peers(2)).toolPromptTokens;
        const a32 = measureToolBudget("a2a", peers(32)).toolPromptTokens;
        expect(a32).toBeGreaterThan(a2 * 10); // ~16x more tools
    });

    it("at usable N the GCP budget is far below A2A's", () => {
        const g = measureToolBudget("gcp", peers(16)).toolPromptTokens;
        const a = measureToolBudget("a2a", peers(16)).toolPromptTokens;
        expect(g).toBeLessThan(a);
        expect(g).toBeGreaterThan(0);
    });
});
