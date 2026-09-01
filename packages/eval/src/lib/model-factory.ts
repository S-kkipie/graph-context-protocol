/**
 * Eval model factory: selects the chat-model adapter from the environment so a
 * single `runFullEval` path drives hosted models (OpenRouter via `ChatOpenAI`),
 * local models (Ollama via the native `ChatOllama`), and Gemini via the native
 * `ChatGoogleGenerativeAI`. The same model object is injected into both arms, so
 * the "one neutral construction path / no per-arm drift" property holds
 * regardless of which adapter is chosen.
 *
 * Why a native Gemini adapter (not the OpenAI-compat shim): Gemini's
 * `…/v1beta/openai/` shim mis-serializes PARALLEL tool calls — the second call
 * in a batch comes back with an empty `function.name`, and the follow-up
 * `function_response.name` is then rejected with HTTP 400 (`Name cannot be
 * empty`). The ReAct agent issues parallel calls whenever a scenario has
 * several peers (e.g. marketplace querying N sellers), so the shim path 400s
 * there. The native `@langchain/google-genai` client speaks Gemini's own
 * function-calling wire format and round-trips parallel calls correctly.
 *
 * Adapter resolution (highest precedence first):
 *   1. explicit `adapter` argument
 *   2. `EVAL_ADAPTER` env (`"ollama"` | `"openrouter"` | `"google"`)
 *   3. inference: a `baseURL` on port 11434 WITHOUT a `/v1` suffix is the
 *      native Ollama API → `"ollama"`; a `…/v1` URL is the OpenAI-compatible
 *      shim → `"openrouter"`
 *   4. default `"openrouter"`
 *
 * The `google` adapter is opt-in (explicit arg or `EVAL_ADAPTER=google`); it
 * ignores `baseURL` (the native client owns its endpoint) and reads the key
 * from `apiKey`, else `GEMINI_API_KEY`, else `GOOGLE_API_KEY`.
 *
 * @module model-factory
 */

import { createOpenRouterLLM } from "@graph-context-protocol/agent-core";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";

export type EvalAdapter = "openrouter" | "ollama" | "google";

/**
 * Drops tool calls with a missing/empty function name from an assistant
 * message. Gemini intermittently emits a batch of PARALLEL tool calls whose
 * second entry has an empty `name`; LangGraph's ToolNode then produces a
 * nameless ToolMessage that `@langchain/google-genai` cannot map back on the
 * next turn, throwing "could not infer a called tool name". Removing the
 * nameless call before ToolNode sees it prevents the bad ToolMessage — the
 * agent simply re-issues that query on a later turn. Returns the message
 * unchanged (same reference) when every call already has a name.
 */
export function stripUnnamedToolCalls(message: AIMessage): AIMessage {
    const calls = message.tool_calls;
    if (!Array.isArray(calls) || calls.length === 0) return message;
    const kept = calls.filter((c) => typeof c.name === "string" && c.name);
    if (kept.length === calls.length) return message;
    return new AIMessage({
        content: message.content,
        tool_calls: kept,
        additional_kwargs: message.additional_kwargs,
        response_metadata: message.response_metadata,
        usage_metadata: message.usage_metadata,
        id: message.id,
        name: message.name,
    });
}

/**
 * `ChatGoogleGenerativeAI` that sanitizes each response via
 * {@link stripUnnamedToolCalls}. Streaming is disabled so every call goes
 * through `_generate` (the sanitize point); the eval reads whole messages, not
 * token deltas, so this costs nothing.
 */
class SafeChatGoogleGenerativeAI extends ChatGoogleGenerativeAI {
    constructor(fields: ConstructorParameters<typeof ChatGoogleGenerativeAI>[0]) {
        super(fields);
        // Belt-and-suspenders: guarantee the non-streaming _generate path even
        // if the base class dropped the constructor flag.
        this.disableStreaming = true;
    }

    override async _generate(
        messages: BaseMessage[],
        options: this["ParsedCallOptions"],
        runManager?: CallbackManagerForLLMRun,
    ): Promise<ChatResult> {
        const result = await super._generate(messages, options, runManager);
        for (const gen of result.generations) {
            const msg = gen.message;
            if (msg instanceof AIMessage) {
                const fixed = stripUnnamedToolCalls(msg);
                if (fixed !== msg) gen.message = fixed;
            }
        }
        return result;
    }
}

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
    if (
        fromEnv === "ollama" ||
        fromEnv === "openrouter" ||
        fromEnv === "google"
    )
        return fromEnv;
    const url = cfg.baseURL ?? env.EVAL_BASE_URL;
    if (url && url.includes(":11434") && !url.includes("/v1")) return "ollama";
    return "openrouter";
}

/**
 * Builds the chat model for the resolved adapter. Construction makes NO network
 * call for any adapter. The ollama path needs no API key; the google path reads
 * `apiKey`/`GEMINI_API_KEY`/`GOOGLE_API_KEY`; the openrouter path delegates to
 * the shared `createOpenRouterLLM` (which requires a key).
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
    if (adapter === "google") {
        const apiKey =
            cfg.apiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? "";
        return new SafeChatGoogleGenerativeAI({
            model: cfg.model ?? "gemini-2.5-flash-lite",
            apiKey,
            // Force the non-streaming _generate path so tool-call sanitizing
            // (empty-name parallel calls) always runs.
            disableStreaming: true,
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
