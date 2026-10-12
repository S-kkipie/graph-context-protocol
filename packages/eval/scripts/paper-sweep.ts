/**
 * Paper-revision sweep: runs the requested scenarios x arms x seeds for ONE
 * model and appends every run to a JSONL raw log (default docs/eval/raw/).
 * Arms are interleaved per seed (gcp, a2a, a2a-pep for seed 1, then seed 2, ...)
 * so provider drift hits the arms equally. Resumable: re-running with the same
 * arguments skips runs already logged as successful; failed runs are retried.
 *
 * Usage (from repo root):
 *   pnpm tsx packages/eval/scripts/paper-sweep.ts --model qwen3:4b --adapter ollama \
 *       --base-url http://localhost:11434 --seeds 30
 *   GEMINI_API_KEY=... pnpm tsx packages/eval/scripts/paper-sweep.ts \
 *       --model gemini-2.5-flash --adapter google --seeds 30
 *
 * Flags:
 *   --model <id>         required
 *   --adapter <a>        ollama | google | openrouter | mock  (default: ollama; mock = hermetic pipeline check, no model)
 *   --base-url <url>     Ollama / OpenAI-compat base URL
 *   --seeds <n>          seeds per arm per scenario    (default: 30)
 *   --arms <list>        default gcp,a2a,a2a-pep
 *   --scenarios <list>   default software-org,supply-chain,delegation,forced-access,useful-forbidden
 *   --out <dir>          default docs/eval/raw (docs/eval/swap/<variant> when --tool-descriptions is given)
 *   --tool-descriptions <v>  native | swapped  (diagnostic: swapped gives each arm the other protocol's tool wording)
 *   --throttle-ms <n>    pause between runs            (default: 0 local / 2000 hosted)
 *   --retries <n>        per-run retries on error      (default: 3)
 *   --dry-run            print the plan and exit (no model calls)
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS, type ScenarioId } from "@graph-context-protocol/agent-core";
import { createMockChatModel } from "../src/lib/mock-model";
import {
    appendRecord,
    completedKeys,
    readRecords,
    recordKey,
} from "../src/lib/raw-log";
import { collectResult } from "../src/lib/run-eval";
import type { Arm } from "../src/lib/runner";
import type { ToolDescriptions } from "../src/lib/tool-descriptions";

function flag(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const model = flag("model");
if (!model) {
    console.error("--model is required");
    process.exit(2);
}
const adapter = flag("adapter") ?? "ollama";
const baseURL =
    flag("base-url") ??
    process.env.EVAL_BASE_URL ??
    (adapter === "ollama" ? "http://localhost:11434" : undefined);
const seeds = Number(flag("seeds") ?? "30");
const arms = (flag("arms") ?? "gcp,a2a,a2a-pep").split(",") as Arm[];
const scenarioIds = (
    flag("scenarios") ??
    "software-org,supply-chain,delegation,forced-access,useful-forbidden"
).split(",") as ScenarioId[];
const retries = Number(flag("retries") ?? "3");
const throttleMs = Number(
    flag("throttle-ms") ??
        (adapter === "ollama" || adapter === "mock" ? "0" : "2000"),
);

const toolDescriptions = flag("tool-descriptions") as
    | ToolDescriptions
    | undefined;
if (toolDescriptions && !["native", "swapped"].includes(toolDescriptions)) {
    console.error("--tool-descriptions must be native or swapped");
    process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(
    flag("out") ??
        (toolDescriptions
            ? join(
                  here,
                  "..",
                  "..",
                  "..",
                  "docs",
                  "eval",
                  "swap",
                  toolDescriptions,
              )
            : join(here, "..", "..", "..", "docs", "eval", "raw")),
);
const safeModel = model.replace(/[^a-zA-Z0-9_.-]/g, "_");
const file = join(outDir, `${safeModel}.jsonl`);

if (adapter !== "mock") process.env.EVAL_ADAPTER = adapter;
const apiKey =
    adapter === "ollama" || adapter === "mock"
        ? "ollama"
        : (process.env.GEMINI_API_KEY ??
          process.env.GOOGLE_API_KEY ??
          process.env.OPENROUTER_API_KEY ??
          "");
if (adapter !== "ollama" && adapter !== "mock" && !apiKey && !has("dry-run")) {
    console.error(
        "No API key in GEMINI_API_KEY / GOOGLE_API_KEY / OPENROUTER_API_KEY",
    );
    process.exit(2);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const done = completedKeys(readRecords(file));

type Job = { scenario: ScenarioId; arm: Arm; seed: number };
const jobs: Job[] = [];
for (const scenario of scenarioIds) {
    for (let seed = 1; seed <= seeds; seed++) {
        for (const arm of arms) jobs.push({ scenario, arm, seed });
    }
}
const todo = jobs.filter(
    (j) =>
        !done.has(
            recordKey({
                model,
                scenario: j.scenario,
                arm: j.arm,
                seed: j.seed,
            }),
        ),
);

console.log(
    `[sweep] model=${model} adapter=${adapter} seeds=${seeds} arms=${arms.join(",")}\n` +
        `[sweep] scenarios=${scenarioIds.join(",")} toolDescriptions=${toolDescriptions ?? "native"}\n` +
        `[sweep] log=${file}\n[sweep] ${todo.length}/${jobs.length} runs to do (${jobs.length - todo.length} already logged)`,
);
if (has("dry-run")) process.exit(0);

let ok = 0;
let failed = 0;
for (const [i, job] of todo.entries()) {
    const scenario = SCENARIOS[job.scenario];
    const started = Date.now();
    let result: Awaited<ReturnType<typeof collectResult>> | undefined;
    let error: string | undefined;
    for (let attempt = 1; attempt <= retries && !result; attempt++) {
        if (throttleMs > 0) await sleep(throttleMs * attempt);
        try {
            result = await collectResult({
                scenario,
                arm: job.arm,
                n: scenario.knowledgeNodes.length,
                seed: job.seed,
                ...(toolDescriptions ? { toolDescriptions } : {}),
                ...(adapter === "mock"
                    ? {
                          model: createMockChatModel({
                              finalAnswer: "mock answer",
                          }),
                      }
                    : {
                          llm: {
                              apiKey,
                              model,
                              ...(baseURL ? { baseURL } : {}),
                          },
                      }),
            });
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
        }
    }
    appendRecord(file, {
        model,
        adapter,
        scenario: job.scenario,
        arm: job.arm,
        seed: job.seed,
        at: new Date().toISOString(),
        durationMs: Date.now() - started,
        ...(toolDescriptions ? { toolDescriptions } : {}),
        ...(result ? { result } : { error: error ?? "unknown" }),
    });
    if (result) ok++;
    else failed++;
    console.log(
        `[sweep] ${i + 1}/${todo.length} ${job.scenario} ${job.arm} seed=${job.seed} ` +
            `${result ? `ok success=${result.behavioral.taskSuccess} tokens=${result.behavioral.tokens}` : `FAILED ${error}`} ` +
            `(${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
}
console.log(`[sweep] finished: ${ok} ok, ${failed} failed. Log: ${file}`);
if (failed > 0)
    console.log("[sweep] re-run the same command to retry failed runs.");
