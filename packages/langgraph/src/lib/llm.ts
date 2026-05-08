/**
 * OpenRouter LLM factory.
 *
 * Provides a convenient factory for creating LangChain ChatOpenAI instances
 * configured to use the OpenRouter API (OpenAI-compatible).
 *
 * @module llm
 */

import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

/**
 * Configuration options for creating an OpenRouter LLM.
 */
export interface OpenRouterLLMConfig {
    /** OpenRouter model identifier (default: "openai/gpt-4o-mini") */
    readonly model?: string;
    /** Sampling temperature (default: 0.7) */
    readonly temperature?: number;
    /** Max tokens per response (default: 2048) */
    readonly maxTokens?: number;
    /** API key (falls back to OPENROUTER_API_KEY env var) */
    readonly apiKey?: string;
    /** OpenRouter base URL (default: https://openrouter.ai/api/v1) */
    readonly baseURL?: string;
}

const OpenRouterLLMConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    apiKey: z.string().optional(),
    baseURL: z.string().url().optional(),
});

/**
 * Creates a ChatOpenAI instance configured for OpenRouter.
 *
 * Reads the API key from the `OPENROUTER_API_KEY` environment variable
 * if not provided explicitly.
 *
 * @param config - Optional configuration overrides
 * @returns Configured ChatOpenAI instance
 * @throws Error if no API key is available
 *
 * @example
 * ```typescript
 * const llm = createOpenRouterLLM({ model: "anthropic/claude-3.5-sonnet" });
 * const response = await llm.invoke("Hello!");
 * ```
 */
export function createOpenRouterLLM(
    config: OpenRouterLLMConfig = {},
): ChatOpenAI {
    const validated = OpenRouterLLMConfigSchema.parse(config);
    const apiKey = validated.apiKey ?? process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        throw new Error(
            "OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable or pass apiKey explicitly.",
        );
    }

    return new ChatOpenAI({
        model: validated.model ?? "openai/gpt-4o-mini",
        temperature: validated.temperature ?? 0.7,
        maxTokens: validated.maxTokens ?? 2048,
        apiKey,
        configuration: {
            baseURL: validated.baseURL ?? "https://openrouter.ai/api/v1",
        },
    });
}
