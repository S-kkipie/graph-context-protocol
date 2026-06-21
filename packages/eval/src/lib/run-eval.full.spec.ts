/**
 * Gated full-eval entrypoint. Runs the real-LLM evaluation across all scenarios
 * and both arms, then writes the rendered markdown report to results/. Skips
 * cleanly unless RUN_EVAL=1 AND OPENROUTER_API_KEY are set, so CI never spends.
 *
 * Run it with:
 *   set -a; source .env.local; set +a
 *   RUN_EVAL=1 EVAL_SEEDS=3 pnpm nx test @graph-context-protocol/eval
 *
 * Knobs (env): EVAL_MODEL (OpenRouter model id), EVAL_SEEDS (reps per arm),
 * EVAL_ANCHORS (comma-separated N for the marketplace behavioral anchors).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { runFullEval } from "./run-eval";

const ENABLED =
    process.env.RUN_EVAL === "1" && !!process.env.OPENROUTER_API_KEY;

describe.skipIf(!ENABLED)("full eval (real LLM)", () => {
    it(
        "runs every scenario on both arms and writes a report",
        async () => {
            const seeds = Number(process.env.EVAL_SEEDS ?? "5");
            const anchors = process.env.EVAL_ANCHORS
                ? process.env.EVAL_ANCHORS.split(",").map((s) =>
                      Number(s.trim()),
                  )
                : undefined;
            const report = await runFullEval({ seeds, anchors });

            const dir = join(__dirname, "..", "..", "results");
            mkdirSync(dir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const model = (process.env.EVAL_MODEL ?? "default").replace(
                /[^a-zA-Z0-9_-]/g,
                "_",
            );
            const file = join(dir, `eval-report-${stamp}-${model}.md`);
            const header = [
                "# GCP vs A2A — empirical evaluation",
                "",
                `- model: \`${process.env.EVAL_MODEL ?? "(default)"}\``,
                `- seeds per arm: ${seeds}`,
                `- generated: ${stamp}`,
                "",
            ].join("\n");
            writeFileSync(file, header + report, "utf8");
            // biome-ignore lint/suspicious/noConsole: surface the artifact path
            console.log(`\n[eval] report written: ${file}\n`);
        },
        60 * 60 * 1000,
    );
});
