/**
 * Targeted forced-access-only real-LLM run (local Ollama models named in
 * docs/eval/multi-model-comparison.md). Scoped run — NOT the full
 * runFullEval sweep (that re-runs software-org/supply-chain/delegation/
 * marketplace too, which is unnecessary since this doc already has data for
 * those). Mirrors runbook §3c's local-model config (native ollama adapter,
 * no throttle) but drives only SCENARIOS["forced-access"].
 *
 * Run: pnpm tsx packages/eval/scripts/forced-access-run.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "@graph-context-protocol/agent-core";
import { type MetricsResult, renderTable } from "../src/lib/results";
import { collectResult } from "../src/lib/run-eval";
import type { Arm } from "../src/lib/runner";

const scenario = SCENARIOS["forced-access"];
const n = scenario.knowledgeNodes.length;
const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:11434";

// Same per-model seed counts already used for these three models elsewhere in
// docs/eval/multi-model-comparison.md — keep this run's rows comparable
// (do not silently upgrade a model's sweep here).
const ALL_MODELS: { label: string; model: string; seeds: number }[] = [
    { label: "llama3.1:8b (local)", model: "llama3.1:8b", seeds: 5 },
    { label: "qwen3:4b (local)", model: "qwen3:4b", seeds: 3 },
    { label: "qwen2.5:32b (local, heavy)", model: "qwen2.5:32b", seeds: 3 },
];

// Optional CLI filter: `tsx forced-access-run.ts qwen2.5:32b` runs only that
// model (e.g. to retry one model after an interrupted run without redoing
// the others).
const requested = process.argv.slice(2);
const MODELS = requested.length
    ? ALL_MODELS.filter((m) => requested.includes(m.model))
    : ALL_MODELS;

async function runModel(
    model: string,
    seeds: number,
): Promise<MetricsResult[]> {
    const results: MetricsResult[] = [];
    for (const arm of ["gcp", "a2a"] as const) {
        for (let seed = 1; seed <= seeds; seed++) {
            const started = Date.now();
            const r = await collectResult({
                scenario,
                arm: arm as Arm,
                n,
                seed,
                llm: { apiKey: "ollama", model, baseURL: BASE_URL },
            });
            const secs = ((Date.now() - started) / 1000).toFixed(1);
            console.log(
                `[forced-access] ${model} ${arm} seed=${seed}/${seeds} ` +
                    `attempts=${r.forcedAccess.attempts} denied=${r.forcedAccess.denied} ` +
                    `unauthorizedExecuted=${r.forcedAccess.unauthorizedExecuted} (${secs}s)`,
            );
            results.push(r);
        }
    }
    return results;
}

function containment(results: MetricsResult[], arm: Arm): number {
    const rs = results.filter((r) => r.arm === arm);
    const d = rs[0]?.forcedAccess ?? {
        attempts: 0,
        denied: 0,
        executed: 0,
        unauthorizedExecuted: 0,
    };
    if (d.attempts === 0) return 0;
    const contained =
        arm === "gcp" ? d.denied : d.attempts - d.unauthorizedExecuted;
    return contained / d.attempts;
}

function fmtTokens(results: MetricsResult[], arm: Arm): string {
    const vals = results
        .filter((r) => r.arm === arm)
        .map((r) => r.behavioral.tokens);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance =
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    return vals.length > 1
        ? `${mean.toFixed(1)}±${Math.sqrt(variance).toFixed(1)}`
        : `${mean.toFixed(1)}`;
}

function fmtLatency(results: MetricsResult[], arm: Arm): string {
    const vals = results
        .filter((r) => r.arm === arm)
        .map((r) => r.behavioral.latencyMs);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance =
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    return vals.length > 1
        ? `${mean.toFixed(1)}±${Math.sqrt(variance).toFixed(1)}`
        : `${mean.toFixed(1)}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    const resultsDir = join(__dirname, "..", "results");
    mkdirSync(resultsDir, { recursive: true });

    const summaryRows: string[] = [];
    for (const { label, model, seeds } of MODELS) {
        console.log(`\n=== ${label} (seeds=${seeds}) ===`);
        const results = await runModel(model, seeds);

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const safeModel = model.replace(/[^a-zA-Z0-9_-]/g, "_");
        const file = join(
            resultsDir,
            `eval-report-${stamp}-forced-access-${safeModel}.md`,
        );
        const header = [
            "# forced-access — empirical evaluation",
            "",
            `- model: \`${model}\``,
            `- seeds per arm: ${seeds}`,
            `- generated: ${stamp}`,
            "",
        ].join("\n");
        writeFileSync(
            file,
            header + renderTable("forced-access", results),
            "utf8",
        );
        console.log(`[forced-access] report written: ${file}`);

        const gDenied =
            results.find((r) => r.arm === "gcp")?.forcedAccess.denied ?? 0;
        const aUnauth =
            results.find((r) => r.arm === "a2a")?.forcedAccess
                .unauthorizedExecuted ?? 0;
        summaryRows.push(
            `| ${label} | ${seeds} | ${containment(results, "gcp").toFixed(2)} / ${containment(results, "a2a").toFixed(2)} | ${gDenied} | ${aUnauth} | ${fmtTokens(results, "gcp")} / ${fmtTokens(results, "a2a")} | ${fmtLatency(results, "gcp")} / ${fmtLatency(results, "a2a")} |`,
        );
    }

    const section = [
        "## forced-access (read containmentRate, not successRate — see delegation note above)",
        "| model | seeds | containmentRate g/a | forcedAccessDenied(g) | unauthorizedReadsExecuted(a) | tokens g/a | latencyMs g/a |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...summaryRows,
        "",
    ].join("\n");

    const summaryFile = join(resultsDir, "forced-access-summary.md");
    writeFileSync(summaryFile, section, "utf8");
    console.log(`\n[forced-access] summary section written: ${summaryFile}`);
    console.log("\n" + section);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
