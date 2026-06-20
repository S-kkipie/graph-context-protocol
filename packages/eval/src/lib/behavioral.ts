/**
 * Behavioral collectors: task success (delegates to the scenario oracle) and a
 * token-counting chat-model wrapper that sums usage across calls. messages,
 * connections, round-trips and latency are read by the caller from the
 * CouplingMetrics snapshot / wall-clock around runScenario.
 *
 * @module behavioral
 */

import type { ScenarioDef } from "@graph-context-protocol/agent-core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import type { RunArtifacts } from "./runner";

/** True iff the run's answer satisfies the scenario's success oracle. */
export function taskSuccess(
    scenario: ScenarioDef,
    artifacts: RunArtifacts,
): boolean {
    return scenario.succeeded(artifacts.answer);
}

export interface TokenCounter {
    readonly model: BaseChatModel;
    total(): number;
}

/** Extracts total token usage from a generated message (provider-agnostic). */
export function usageTokens(message: BaseMessage): number {
    // LangChain places token usage on usage_metadata (preferred) or
    // response_metadata.usage / .tokenUsage depending on provider.
    // biome-ignore lint/suspicious/noExplicitAny: provider-specific metadata
    const m = message as any;
    const u = m.usage_metadata;
    if (u && typeof u.total_tokens === "number") return u.total_tokens;
    const r = m.response_metadata ?? {};
    const usage = r.usage ?? r.tokenUsage ?? {};
    const total =
        usage.total_tokens ??
        (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    return typeof total === "number" ? total : 0;
}

/**
 * Wraps a chat model so every generated message's token usage is accumulated.
 * Hooks the model's callbacks so it works regardless of how the brain invokes
 * it. The returned `model` is passed to createTaskAgent as the injected model.
 */
export function createTokenCountingModel(inner: BaseChatModel): TokenCounter {
    let total = 0;
    inner.callbacks = [
        {
            handleLLMEnd: (output: LLMResult) => {
                for (const row of output.generations ?? []) {
                    for (const gen of row) {
                        // ChatGeneration extends Generation and adds `message`
                        // biome-ignore lint/suspicious/noExplicitAny: narrowing ChatGeneration at runtime
                        const msg = (gen as any).message as
                            | BaseMessage
                            | undefined;
                        if (msg) total += usageTokens(msg);
                    }
                }
            },
        },
    ];
    return { model: inner, total: () => total };
}
