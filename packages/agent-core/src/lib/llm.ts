/**
 * OpenRouter LLM factory (OpenAI-compatible). Neutral so both arms share one
 * LLM construction path — no fairness drift between arms.
 *
 * @module llm
 */

import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

export interface OpenRouterLLMConfig {
    readonly model?: string;
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly apiKey?: string;
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
 * Creates a ChatOpenAI configured for OpenRouter. Reads the key from
 * `OPENROUTER_API_KEY` if not passed. Construction makes NO network call.
 *
 * @throws Error if no API key is available.
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
