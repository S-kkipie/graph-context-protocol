import { describe, expect, it } from "vitest";
import { edgeVariants, toolPromptVariants } from "./topology-variants";

describe("topology variants", () => {
    it("A2A through a hub is O(n), same as GCP; only the mesh is O(n^2)", () => {
        for (const n of [2, 8, 32]) {
            const e = edgeVariants(n);
            expect(e.a2aHub).toBe(e.gcpHub);
            expect(e.a2aMesh).toBe(n * (n - 1));
        }
    });

    it("a single generic A2A tool is flat in n, like GCP's query tool", () => {
        const small = toolPromptVariants(2);
        const large = toolPromptVariants(32);
        expect(large.a2aSingleTool).toBe(small.a2aSingleTool);
        expect(large.gcpSingleTool).toBe(small.gcpSingleTool);
        expect(large.a2aPerPeer).toBeGreaterThan(small.a2aPerPeer);
    });
});
