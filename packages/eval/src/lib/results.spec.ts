import { describe, expect, it } from "vitest";
import {
    aggregateBehavioral,
    type MetricsResult,
    renderScalingTable,
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
            // n=3: A2A fetches one card per peer (3), GCP one substrate query (1).
            discoveryMessages: arm === "a2a" ? 3 : 1,
            // A2A binds 3 per-peer tools; GCP binds 1 query tool.
            toolPromptTokens: arm === "a2a" ? 60 : 30,
            messages: 3,
            connections: 3,
            tokens,
            roundTrips: 3,
            latencyMs: 10,
            taskSuccess: success,
        },
        leakage: { canariesReached: 0, totalCanaries: 0, leakageRate: 0 },
        delegation: {
            attempts: 0,
            denied: 0,
            executed: 0,
            unauthorizedExecuted: 0,
        },
        forcedAccess: {
            attempts: 0,
            denied: 0,
            executed: 0,
            unauthorizedExecuted: 0,
        },
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

    it("renders a discoveryMessages row (GCP O(1) vs A2A O(N))", () => {
        const md = renderTable("marketplace", [
            mk("gcp", 1, 50, true),
            mk("a2a", 1, 80, true),
        ]);
        const row = md
            .split("\n")
            .find((l: string) => l.includes("discoveryMessages"));
        expect(row).toBeDefined();
        // gcp 1.0 | a2a 3.0
        expect(row).toContain("1.0");
        expect(row).toContain("3.0");
    });

    it("renders a toolPromptTokens row (GCP O(1) vs A2A O(N))", () => {
        const md = renderTable("marketplace", [
            mk("gcp", 1, 50, true),
            mk("a2a", 1, 80, true),
        ]);
        const row = md
            .split("\n")
            .find((l: string) => l.includes("toolPromptTokens"));
        expect(row).toBeDefined();
        // gcp 30.0 | a2a 60.0
        expect(row).toContain("30.0");
        expect(row).toContain("60.0");
    });
});

describe("renderScalingTable", () => {
    it("emits one row per N with discovery diverging while tokens stay close", () => {
        const results = [mk("gcp", 1, 100, true), mk("a2a", 1, 100, true)];
        const md = renderScalingTable("scaling", results, [3]);
        const row = md.split("\n").find((l: string) => l.startsWith("| 3 |"));
        expect(row).toBeDefined();
        // N | gcp disc | a2a disc | gcp toolTok | a2a toolTok | gcp tokens | a2a tokens | gcp lat | a2a lat
        expect(row).toBe("| 3 | 1 | 3 | 30 | 60 | 100 | 100 | 10 | 10 |");
    });
});
