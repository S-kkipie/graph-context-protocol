import { describe, expect, it } from "vitest";
import { run } from "./app";

describe("App", () => {
    it("should run and return a report", () => {
        const report = run();

        expect(report).toContain("Multi-Agent Collaboration Demo");
        expect(report).toContain("Agent Graph");
        expect(report).toContain("Context Flow");
        expect(report).toContain("Provenance Trace");
        expect(report).toContain("Final State");
    });

    it("should include all four agents", () => {
        const report = run();

        expect(report).toContain("Planner");
        expect(report).toContain("Researcher");
        expect(report).toContain("Writer");
        expect(report).toContain("Reviewer");
    });

    it("should show successful context propagation", () => {
        const report = run();

        expect(report).toContain("✓");
        expect(report).toContain("task.brief");
    });
});
