import { describe, expect, it } from "vitest";
import {
    onboardingCost,
    policyHolders,
    ruleChangeCost,
    surface,
    totalEntries,
} from "./integration-effort";
import { edgeVariants } from "./topology-variants";

describe("integration-effort surface", () => {
    it("peer bindings in a mesh equal the n(n-1) integration edges", () => {
        for (const n of [2, 5, 10]) {
            let bindings = 0;
            for (const [artifact, entries] of surface("a2a-mesh", n))
                if (artifact.startsWith("agent:")) bindings += entries.size;
            expect(bindings).toBe(edgeVariants(n).a2aMesh);
        }
    });

    it("hub styles hold one tool per agent and one registration per node", () => {
        for (const v of ["gcp-hub", "a2a-hub", "a2a-pep-hub"] as const) {
            const s = surface(v, 7);
            expect(s.get("directory")?.size).toBe(7);
            for (let i = 0; i < 7; i++)
                expect(s.get(`agent:${i}`)?.size).toBe(1);
        }
    });
});

describe("onboarding participant n+1", () => {
    it("mesh edits every existing agent; hubs edit only shared artifacts", () => {
        const n = 10;
        expect(onboardingCost("a2a-mesh", n).existingArtifactsTouched).toBe(n);
        expect(onboardingCost("a2a-pep-mesh", n).existingArtifactsTouched).toBe(
            n + 1, // every agent plus the shared credential table
        );
        expect(onboardingCost("a2a-hub", n).existingArtifactsTouched).toBe(1);
        expect(onboardingCost("gcp-hub", n).existingArtifactsTouched).toBe(2);
        expect(onboardingCost("a2a-pep-hub", n).existingArtifactsTouched).toBe(
            2,
        );
    });

    it("entries added grow with n for a mesh and stay constant for hubs", () => {
        expect(onboardingCost("a2a-mesh", 10).entriesAdded).toBe(2 * 10 + 2);
        expect(onboardingCost("a2a-mesh", 50).entriesAdded).toBe(2 * 50 + 2);
        for (const v of ["gcp-hub", "a2a-hub", "a2a-pep-hub"] as const)
            expect(onboardingCost(v, 10).entriesAdded).toBe(
                onboardingCost(v, 50).entriesAdded,
            );
    });

    it("GCP onboarding equals instrumented A2A through a hub, within a few entries", () => {
        const g = onboardingCost("gcp-hub", 10);
        const p = onboardingCost("a2a-pep-hub", 10);
        expect(g.existingArtifactsTouched).toBe(p.existingArtifactsTouched);
        expect(p.entriesAdded - g.entriesAdded).toBe(2); // agent card + PEP wrapper
    });
});

describe("changing an access rule", () => {
    it("is one entry in one artifact wherever a policy exists", () => {
        for (const v of ["gcp-hub", "a2a-pep-mesh", "a2a-pep-hub"] as const) {
            expect(ruleChangeCost(v, 10)).toEqual({
                expressible: true,
                entriesEdited: 1,
                artifactsEdited: 1,
            });
        }
    });

    it("cannot be expressed at all in base A2A", () => {
        expect(ruleChangeCost("a2a-mesh", 10).expressible).toBe(false);
        expect(ruleChangeCost("a2a-hub", 10).expressible).toBe(false);
        expect(policyHolders("a2a-hub", 10)).toBe(0);
    });

    it("every gated style keeps one policy per node", () => {
        for (const v of ["gcp-hub", "a2a-pep-mesh", "a2a-pep-hub"] as const)
            expect(policyHolders(v, 10)).toBe(10);
    });
});

describe("totals", () => {
    it("the mesh total outgrows the hub total", () => {
        expect(totalEntries("a2a-mesh", 20)).toBeGreaterThan(
            totalEntries("a2a-hub", 20),
        );
    });
});
