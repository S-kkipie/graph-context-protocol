import { describe, expect, it } from "vitest";
import {
    aggregateBehavioral,
    type MetricsResult,
    renderTable,
} from "./results";

function mk(
    arm: "gcp" | "a2a",
    seed: number,
    tokens: number,
    success: boolean,
): MetricsResult {
    return {
        scenarioId: "marketplace",
        arm,
        n: 3,
        seed,
        structural: {
            pairwiseConnections: arm === "a2a" ? 6 : 3,
            integrationEffort: arm === "a2a" ? 6 : 1,
        },
        behavioral: {
            messages: 3,
            connections: 3,
            tokens,
            roundTrips: 3,
            latencyMs: 10,
            taskSuccess: success,
        },
        leakage: { canariesReached: 0, totalCanaries: 0, leakageRate: 0 },
        provenance: arm === "gcp" ? 1 : 0,
    };
}

describe("aggregateBehavioral", () => {
    it("computes mean and stdev of a numeric field across seeds", () => {
        const agg = aggregateBehavioral([
            mk("a2a", 1, 100, true),
            mk("a2a", 2, 200, true),
        ]);
        expect(agg.tokens.mean).toBe(150);
        expect(agg.tokens.n).toBe(2);
        expect(agg.tokens.stdev).toBeCloseTo(50);
    });
});

describe("renderTable", () => {
    it("renders a markdown table naming both arms", () => {
        const md = renderTable("marketplace", [
            mk("gcp", 1, 50, true),
            mk("a2a", 1, 80, true),
        ]);
        expect(md).toContain("marketplace");
        expect(md).toContain("gcp");
        expect(md).toContain("a2a");
        expect(md).toContain("|");
    });
});
