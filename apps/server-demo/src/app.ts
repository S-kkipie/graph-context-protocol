import { renderScenarioReport } from "./demo/report";
import { runServerScenario } from "./demo/scenario";

/** Runs the server runtime demo and returns the report */
export async function run(): Promise<string> {
    const result = await runServerScenario();
    return renderScenarioReport(result);
}
