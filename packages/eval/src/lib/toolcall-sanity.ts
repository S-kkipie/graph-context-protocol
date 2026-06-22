/**
 * Pre-flight gate: does this model's API actually drive the ReAct agent's tool
 * calls? A model that emits no `tool_calls` yields 0 round-trips and therefore
 * meaningless behavioral metrics — exclude it from the sweep instead of letting
 * it pollute the comparison tables. Transport-agnostic: works for any injected
 * BaseChatModel (OpenRouter via ChatOpenAI, local via ChatOllama, or a mock).
 *
 * @module toolcall-sanity
 */

import { SCENARIOS } from "@graph-context-protocol/agent-core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { runScenario } from "./runner";

export interface ToolCallSanity {
    /** True iff the agent issued at least one peer-context tool call. */
    readonly ok: boolean;
    /** Number of tool invocations recorded (transcript length). */
    readonly roundTrips: number;
    /** The agent's final answer (useful when diagnosing a 0-round-trip model). */
    readonly answer: string;
}

/**
 * Runs ONE `gcp`-arm `supply-chain` scenario and reports whether the model
 * drove any tool call. Pass either an injected `model` or an `llm` carrier
 * (`{ apiKey, model, baseURL }`) — the latter builds an OpenRouter/OpenAI-
 * compatible client via the shared factory.
 */
export async function canDriveToolCalls(opts: {
    model?: BaseChatModel;
    llm?: { apiKey?: string; model?: string; baseURL?: string };
}): Promise<ToolCallSanity> {
    const artifacts = await runScenario({
        arm: "gcp",
        scenario: SCENARIOS["supply-chain"],
        model: opts.model,
        llm: opts.llm,
    });
    const roundTrips = artifacts.toolTranscript.length;
    return { ok: roundTrips > 0, roundTrips, answer: artifacts.answer };
}
