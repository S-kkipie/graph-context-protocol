import { describe, expect, it } from "vitest";
import { structuralMetrics } from "./topology";

describe("structuralMetrics", () => {
    it("A2A acquaintance grows quadratically (n*(n-1))", () => {
        expect(structuralMetrics("a2a", 2).pairwiseConnections).toBe(2);
        expect(structuralMetrics("a2a", 5).pairwiseConnections).toBe(20);
        expect(structuralMetrics("a2a", 10).pairwiseConnections).toBe(90);
    });

    it("GCP acquaintance grows linearly (n)", () => {
        expect(structuralMetrics("gcp", 2).pairwiseConnections).toBe(2);
        expect(structuralMetrics("gcp", 5).pairwiseConnections).toBe(5);
        expect(structuralMetrics("gcp", 50).pairwiseConnections).toBe(50);
    });

    it("integration effort: A2A ~O(n), GCP ~O(1)", () => {
        // add one node: A2A delta = (n+1)n - n(n-1) = 2n ; GCP delta = 1
        expect(structuralMetrics("a2a", 10).integrationEffort).toBe(20);
        expect(structuralMetrics("gcp", 10).integrationEffort).toBe(1);
    });
});
