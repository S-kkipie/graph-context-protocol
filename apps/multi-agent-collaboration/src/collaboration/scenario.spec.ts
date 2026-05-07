import { describe, expect, it } from "vitest";
import { getDefaultSteps, runCollaborationScenario } from "./scenario";

describe("Scenario", () => {
    describe("getDefaultSteps", () => {
        it("should return three workflow steps", () => {
            const steps = getDefaultSteps();

            expect(steps.length).toBe(3);
        });

        it("should define correct workflow order", () => {
            const steps = getDefaultSteps();

            expect(steps[0].from).toBe("planner");
            expect(steps[0].to).toBe("researcher");
            expect(steps[1].from).toBe("researcher");
            expect(steps[1].to).toBe("writer");
            expect(steps[2].from).toBe("writer");
            expect(steps[2].to).toBe("reviewer");
        });
    });

    describe("runCollaborationScenario", () => {
        it("should return a complete scenario result", () => {
            const result = runCollaborationScenario();

            expect(result.graph).toBeDefined();
            expect(result.steps).toBeDefined();
            expect(result.propagations).toBeDefined();
            expect(result.messages).toBeDefined();
            expect(result.traces).toBeDefined();
            expect(result.finalContext).toBeDefined();
            expect(result.startTime).toBeDefined();
            expect(result.endTime).toBeDefined();
        });

        it("should have successful propagations", () => {
            const result = runCollaborationScenario();

            const allSuccessful = result.propagations.every((p) => p.success);
            expect(allSuccessful).toBe(true);
        });

        it("should have three propagations for three steps", () => {
            const result = runCollaborationScenario();

            expect(result.propagations.length).toBe(3);
        });

        it("should filter planner notes in first step", () => {
            const result = runCollaborationScenario();

            const firstPropagation = result.propagations[0];
            expect(firstPropagation.excludedKeys).toContain("planner.notes");
        });

        it("should have messages with provenance", () => {
            const result = runCollaborationScenario();

            expect(result.messages.length).toBeGreaterThan(0);
            expect(result.traces.length).toBeGreaterThan(0);
        });

        it("should have traces for each step", () => {
            const result = runCollaborationScenario();

            expect(result.traces.length).toBe(3);
        });

        it("should have final context with propagated data", () => {
            const result = runCollaborationScenario();

            expect(result.finalContext).not.toBeNull();
            expect(
                Object.keys(result.finalContext?.accumulatedData ?? {}).length,
            ).toBeGreaterThan(0);
        });
    });
});
