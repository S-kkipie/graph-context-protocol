/**
 * One-off investigation: why did llama3.1:8b make 0 tool calls on the
 * forced-access scenario (both arms) while it drove tool calls fine on the
 * other three scenarios? Runs one seed per arm directly via runScenario and
 * prints the full final answer + tool transcript (not just aggregated
 * metrics) so the actual model behavior is visible.
 *
 * Run: pnpm tsx packages/eval/scripts/investigate-llama-forced-access.ts
 */

import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { createEvalModel } from "../src/lib/model-factory";
import { runScenario } from "../src/lib/runner";

const scenario = SCENARIOS["forced-access"];
const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:11434";

async function main() {
    for (const arm of ["gcp", "a2a"] as const) {
        console.log(`\n=== ${arm} ===`);
        // Build the model the SAME way collectResult does (adapter-aware),
        // instead of passing `llm` straight to runScenario — that path goes
        // to createTaskAgent's default OpenRouter builder and ignores the
        // ollama baseURL, which is why a naive first attempt 401'd.
        const model = createEvalModel({
            model: "llama3.1:8b",
            baseURL: BASE_URL,
        });
        const artifacts = await runScenario({ arm, scenario, model });
        console.log(
            "toolTranscript:",
            JSON.stringify(artifacts.toolTranscript, null, 2),
        );
        console.log("answer:", JSON.stringify(artifacts.answer));
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
