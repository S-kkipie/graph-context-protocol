import { describe, expect, it } from "vitest";
import { createOpenRouterLLM, type OpenRouterLLMConfig } from "./llm";

const originalEnv = process.env.OPENROUTER_API_KEY;

describe("llm", () => {
    afterEach(() => {
        process.env.OPENROUTER_API_KEY = originalEnv;
    });

    describe("createOpenRouterLLM", () => {
        it("should throw when api key is missing", () => {
            delete process.env.OPENROUTER_API_KEY;
            expect(() => createOpenRouterLLM()).toThrow("OpenRouter API key");
        });

        it("should create LLM with explicit api key", () => {
            const llm = createOpenRouterLLM({ apiKey: "test-key" });
            expect(llm).toBeDefined();
            expect(llm._modelType()).toBe("base_chat_model");
        });

        it("should create LLM with env var api key", () => {
            process.env.OPENROUTER_API_KEY = "env-key";
            const llm = createOpenRouterLLM();
            expect(llm).toBeDefined();
        });

        it("should use custom model and temperature", () => {
            const llm = createOpenRouterLLM({
                apiKey: "test-key",
                model: "anthropic/claude-3-opus",
                temperature: 0.2,
                maxTokens: 1024,
            });
            expect(llm).toBeDefined();
        });

        it("should reject invalid config with zod", () => {
            expect(() =>
                createOpenRouterLLM({
                    apiKey: "test-key",
                    temperature: 5,
                } as OpenRouterLLMConfig),
            ).toThrow();
        });
    });
});
