/**
 * Eval model factory: selects the chat-model adapter from the environment so a
 * single `runFullEval` path drives BOTH hosted models (OpenRouter via
 * `ChatOpenAI`) and local models (Ollama via the native `ChatOllama`). The same
 * model object is injected into both arms, so the "one neutral construction
 * path / no per-arm drift" property holds regardless of which adapter is chosen.
 *
 * Adapter resolution (highest precedence first):
 *   1. explicit `adapter` argument
 *   2. `EVAL_ADAPTER` env (`"ollama"` | `"openrouter"`)
 *   3. inference: a `baseURL` on port 11434 WITHOUT a `/v1` suffix is the
 *      native Ollama API → `"ollama"`; a `…/v1` URL is the OpenAI-compatible
 *      shim → `"openrouter"`
 *   4. default `"openrouter"`
 *
 * @module model-factory
 */

import { createOpenRouterLLM } from "@graph-context-protocol/agent-core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOllama } from "@langchain/ollama";

export type EvalAdapter = "openrouter" | "ollama";

export interface EvalModelConfig {
    readonly apiKey?: string;
    readonly model?: string;
    readonly baseURL?: string;
    readonly adapter?: EvalAdapter;
    readonly temperature?: number;
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Resolves which adapter to use from explicit config, env, then baseURL shape. */
export function resolveAdapter(
    cfg: { adapter?: EvalAdapter; baseURL?: string } = {},
    env: Record<string, string | undefined> = process.env,
): EvalAdapter {
    if (cfg.adapter) return cfg.adapter;
    const fromEnv = env.EVAL_ADAPTER;
    if (fromEnv === "ollama" || fromEnv === "openrouter") return fromEnv;
    const url = cfg.baseURL ?? env.EVAL_BASE_URL;
    if (url && url.includes(":11434") && !url.includes("/v1")) return "ollama";
    return "openrouter";
}

/**
 * Builds the chat model for the resolved adapter. Construction makes NO network
 * call for either adapter. The ollama path needs no API key; the openrouter
 * path delegates to the shared `createOpenRouterLLM` (which requires a key).
 */
export function createEvalModel(
    cfg: EvalModelConfig = {},
    env: Record<string, string | undefined> = process.env,
): BaseChatModel {
    const adapter = resolveAdapter(cfg, env);
    if (adapter === "ollama") {
        return new ChatOllama({
            model: cfg.model ?? "qwen3:4b",
            baseUrl:
                cfg.baseURL ?? env.EVAL_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
            ...(cfg.temperature !== undefined
                ? { temperature: cfg.temperature }
                : {}),
        });
    }
    return createOpenRouterLLM({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseURL: cfg.baseURL,
        ...(cfg.temperature !== undefined
            ? { temperature: cfg.temperature }
            : {}),
    });
}
