/**
 * App orchestration - runs the collaboration scenario.
 * @module app
 */

import { runCollaborationScenario } from "./collaboration/scenario";
import { renderScenarioReport } from "./collaboration/report";

/** Runs the multi-agent collaboration demo and returns the report */
export function run(): string {
    const result = runCollaborationScenario();
    return renderScenarioReport(result);
}
