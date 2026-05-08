import { describe, expect, it } from "vitest";
import { renderScenarioReport } from "./report";
import { runServerScenario } from "./scenario";

describe("renderScenarioReport", () => {
    it("includes server status, transport ID, handler result, external delivery, and knowledge result", async () => {
        const scenario = await runServerScenario();
        const report = renderScenarioReport(scenario);
        expect(report).toContain("Server ID: server:demo");
        expect(report).toContain("Status: stopped");
        expect(report).toContain("transport:memory");
        expect(report).toContain("handled: true");
        expect(report).toContain("delivered: true");
        expect(report).toContain("knowledge:demo");
    });
});
