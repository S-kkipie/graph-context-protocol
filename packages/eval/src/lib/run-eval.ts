/**
 * Assembles a full MetricsResult from one scenario+arm run, and the gated
 * full-run entrypoint that produces the article's markdown report. CI uses
 * collectResult with the mock model (hermetic); full runs use the real LLM over
 * seeds (gated on RUN_EVAL=1 + OPENROUTER_API_KEY).
 *
 * @module run-eval
 */

import {
    marketplaceScenario,
    SCENARIOS,
    type ScenarioDef,
} from "@graph-context-protocol/agent-core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createTokenCountingModel, taskSuccess } from "./behavioral";
import { detectLeaks } from "./canary";
import { delegationMetrics } from "./delegation";
import { createEvalModel } from "./model-factory";
import { provenanceCompleteness } from "./provenance";
import { type MetricsResult, renderScalingTable, renderTable } from "./results";
import { type Arm, runScenario } from "./runner";
import { structuralMetrics } from "./topology";

export interface CollectOptions {
    readonly scenario: ScenarioDef;
    readonly arm: Arm;
    readonly n: number;
    readonly seed: number;
    readonly model?: BaseChatModel;
    readonly llm?: { apiKey?: string; model?: string; baseURL?: string };
}

/**
 * Builds the LLM carrier for a full-eval run. `baseURL` resolution: explicit
 * argument wins, else `EVAL_BASE_URL` from the environment, else omitted (so
 * `createOpenRouterLLM` uses its OpenRouter default). Pointing `baseURL` at a
 * local OpenAI-compatible server (e.g. Ollama `http://localhost:11434/v1`) is
 * the entire mechanism for evaluating local models — same code path, no
 * per-arm drift.
 */
export function buildLlmConfig(
    apiKey: string,
    model: string,
    baseURL?: string,
    env: Record<string, string | undefined> = process.env,
): { apiKey: string; model: string; baseURL?: string } {
    const resolved = baseURL ?? env.EVAL_BASE_URL;
    return { apiKey, model, ...(resolved ? { baseURL: resolved } : {}) };
}

/** Runs one scenario+arm and assembles the full MetricsResult. */
export async function collectResult(
    opts: CollectOptions,
): Promise<MetricsResult> {
    // Token counting needs a model instance to wrap. When the caller injects a
    // model (mock/wrapped) use it; otherwise, for real-LLM runs, build the eval
    // model here (OpenRouter or Ollama, selected by env via createEvalModel) so
    // its usage is counted too (createTaskAgent would otherwise build it
    // internally and the counter would never attach).
    const base =
        opts.model ?? (opts.llm ? createEvalModel(opts.llm) : undefined);
    const counter = base ? createTokenCountingModel(base) : undefined;
    const started = performance.now();
    const artifacts = await runScenario({
        arm: opts.arm,
        scenario: opts.scenario,
        model: counter?.model ?? opts.model,
        llm: opts.llm,
    });
    const latencyMs = performance.now() - started;
    const readDecisions = artifacts.coupling.messagesSent;
    return {
        scenarioId: opts.scenario.id,
        arm: opts.arm,
        n: opts.n,
        seed: opts.seed,
        structural: structuralMetrics(opts.arm, opts.n),
        behavioral: {
            discoveryMessages: artifacts.discovery.discoveryMessages,
            toolPromptTokens: artifacts.toolBudget.toolPromptTokens,
            messages: artifacts.coupling.messagesSent,
            connections: artifacts.coupling.connectionsOpened,
            tokens: counter ? counter.total() : 0,
            roundTrips: artifacts.toolTranscript.length,
            latencyMs,
            taskSuccess: taskSuccess(opts.scenario, artifacts),
        },
        leakage: detectLeaks(opts.scenario, artifacts),
        delegation: delegationMetrics(opts.scenario, artifacts, opts.arm),
        provenance: provenanceCompleteness(artifacts, readDecisions),
    };
}

/**
 * Gated full evaluation across the three scenarios, both arms, K seeds. Returns
 * the rendered markdown report. Requires RUN_EVAL=1 + OPENROUTER_API_KEY.
 */
export async function runFullEval(opts?: {
    seeds?: number;
    sweep?: number[];
    anchors?: number[];
    model?: string;
    baseURL?: string;
}): Promise<string> {
    const key = process.env.OPENROUTER_API_KEY;
    if (process.env.RUN_EVAL !== "1" || !key) {
        throw new Error(
            "runFullEval requires RUN_EVAL=1 and OPENROUTER_API_KEY",
        );
    }
    const seeds = opts?.seeds ?? 5;
    // Log-spaced sweep so the discovery curve (A2A O(N) vs GCP O(1)) and runtime
    // parity are both legible per N. Override with EVAL_ANCHORS.
    const anchors = opts?.anchors ?? [2, 4, 8, 16, 32];
    // Free OpenRouter models support tool-calling (react agent needs it);
    // overridable via opts.model or EVAL_MODEL. Default is a free tier model.
    const model =
        opts?.model ??
        process.env.EVAL_MODEL ??
        "meta-llama/llama-3.3-70b-instruct:free";
    const llm = buildLlmConfig(key, model, opts?.baseURL);
    // Throttle between runs to stay under free-tier per-minute rate limits.
    const throttleMs = Number(process.env.EVAL_THROTTLE_MS ?? "4000");
    const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });
    // Retry a whole run if it fails (e.g. free-tier 429 that outlasts the
    // per-call backoff), with a growing pause between attempts.
    const runRetries = Number(process.env.EVAL_RUN_RETRIES ?? "3");
    const runOne = async (o: CollectOptions): Promise<MetricsResult> => {
        let lastErr: unknown;
        for (let attempt = 1; attempt <= runRetries; attempt++) {
            if (throttleMs > 0) await sleep(throttleMs * attempt);
            try {
                return await collectResult(o);
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr;
    };
    const scenarios: ScenarioDef[] = [
        SCENARIOS["software-org"],
        SCENARIOS["supply-chain"],
        SCENARIOS.delegation,
    ];
    const sections: string[] = [];

    // Behavioral scenarios (software-org, supply-chain, delegation) at fixed topology.
    for (const scenario of scenarios) {
        const results: MetricsResult[] = [];
        for (const arm of ["gcp", "a2a"] as const) {
            for (let seed = 1; seed <= seeds; seed++) {
                results.push(
                    await runOne({
                        scenario,
                        arm,
                        n: scenario.knowledgeNodes.length,
                        seed,
                        llm,
                    }),
                );
            }
        }
        sections.push(renderTable(scenario.id, results));
    }

    // Marketplace: behavioral at anchor N + structural curve at every N.
    const mkt: MetricsResult[] = [];
    for (const n of anchors) {
        for (const arm of ["gcp", "a2a"] as const) {
            for (let seed = 1; seed <= seeds; seed++) {
                mkt.push(
                    await runOne({
                        scenario: marketplaceScenario(n),
                        arm,
                        n,
                        seed,
                        llm,
                    }),
                );
            }
        }
    }
    // Per-N scaling first (the headline curve), then one detail table per N.
    // Pooling all anchors into ONE table conflates different N and is what made
    // the earlier marketplace row (messages 5.7 ± 3.3) meaningless.
    sections.push(
        renderScalingTable(
            "marketplace scaling — discovery + tool-prompt O(1) vs O(N), query at parity",
            mkt,
            anchors,
        ),
    );
    for (const n of anchors) {
        sections.push(
            renderTable(
                `marketplace (N=${n})`,
                mkt.filter((r) => r.n === n),
            ),
        );
    }

    sections.push("### marketplace structural curve (pairwiseConnections)");
    sections.push("");
    sections.push("| N | gcp | a2a |");
    sections.push("| --- | --- | --- |");
    for (let n = 2; n <= 50; n++) {
        sections.push(
            `| ${n} | ${structuralMetrics("gcp", n).pairwiseConnections} | ${structuralMetrics("a2a", n).pairwiseConnections} |`,
        );
    }
    sections.push("");
    return sections.join("\n");
}
