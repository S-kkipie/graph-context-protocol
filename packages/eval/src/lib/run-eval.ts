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
import { provenanceCompleteness } from "./provenance";
import { type MetricsResult, renderTable } from "./results";
import { type Arm, runScenario } from "./runner";
import { structuralMetrics } from "./topology";

export interface CollectOptions {
    readonly scenario: ScenarioDef;
    readonly arm: Arm;
    readonly n: number;
    readonly seed: number;
    readonly model?: BaseChatModel;
    readonly llm?: { apiKey?: string };
}

/** Runs one scenario+arm and assembles the full MetricsResult. */
export async function collectResult(
    opts: CollectOptions,
): Promise<MetricsResult> {
    const counter = opts.model
        ? createTokenCountingModel(opts.model)
        : undefined;
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
            messages: artifacts.coupling.messagesSent,
            connections: artifacts.coupling.connectionsOpened,
            tokens: counter ? counter.total() : 0,
            roundTrips: artifacts.toolTranscript.length,
            latencyMs,
            taskSuccess: taskSuccess(opts.scenario, artifacts),
        },
        leakage: detectLeaks(opts.scenario, artifacts),
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
}): Promise<string> {
    const key = process.env.OPENROUTER_API_KEY;
    if (process.env.RUN_EVAL !== "1" || !key) {
        throw new Error(
            "runFullEval requires RUN_EVAL=1 and OPENROUTER_API_KEY",
        );
    }
    const seeds = opts?.seeds ?? 5;
    const anchors = opts?.anchors ?? [2, 5, 10];
    const llm = { apiKey: key };
    const scenarios: ScenarioDef[] = [
        SCENARIOS["software-org"],
        SCENARIOS["supply-chain"],
    ];
    const sections: string[] = [];

    // Behavioral scenarios (software-org, supply-chain) at fixed topology.
    for (const scenario of scenarios) {
        const results: MetricsResult[] = [];
        for (const arm of ["gcp", "a2a"] as const) {
            for (let seed = 1; seed <= seeds; seed++) {
                results.push(
                    await collectResult({
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
                    await collectResult({
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
    sections.push(renderTable("marketplace", mkt));

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
