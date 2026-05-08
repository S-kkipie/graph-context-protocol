/**
 * App orchestration - runs the collaboration demo.
 * @module app
 */

import { renderScenarioReport } from "./collaboration/report";
import { runCollaborationScenario } from "./collaboration/scenario";

/** Runs the deterministic multi-agent collaboration demo (no LLM required) */
export function run(): string {
    const result = runCollaborationScenario();
    return renderScenarioReport(result);
}
