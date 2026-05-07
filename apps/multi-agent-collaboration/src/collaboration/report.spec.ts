import { describe, expect, it } from "vitest";
import { renderScenarioReport } from "./report";
import { runCollaborationScenario } from "./scenario";

describe("Report", () => {
    it("should render a complete report", () => {
        const result = runCollaborationScenario();
        const report = renderScenarioReport(result);

        expect(report).toContain("# Multi-Agent Collaboration Demo");
        expect(report).toContain("Agent Graph");
        expect(report).toContain("Context Flow");
        expect(report).toContain("Provenance Trace");
        expect(report).toContain("Final State");
    });

    it("should include agent descriptions", () => {
        const result = runCollaborationScenario();
        const report = renderScenarioReport(result);

        expect(report).toContain("Plans tasks and defines goals");
        expect(report).toContain("Gathers information and findings");
        expect(report).toContain("Creates content based on research");
        expect(report).toContain("Reviews and provides feedback");
    });

    it("should show propagation status", () => {
        const result = runCollaborationScenario();
        const report = renderScenarioReport(result);

        expect(report).toContain("✓");
        expect(report).toContain("Planner → Researcher");
    });

    it("should show context keys", () => {
        const result = runCollaborationScenario();
        const report = renderScenarioReport(result);

        expect(report).toContain("task.brief");
    });

    it("should show statistics in final state", () => {
        const result = runCollaborationScenario();
        const report = renderScenarioReport(result);

        expect(report).toContain("Total steps:");
        expect(report).toContain("Successful propagations:");
        expect(report).toContain("Messages exchanged:");
    });
});
