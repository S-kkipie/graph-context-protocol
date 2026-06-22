import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { describe, expect, it } from "vitest";
import { createEvalModel, resolveAdapter } from "./model-factory";

describe("resolveAdapter", () => {
    it("prefers an explicit adapter argument", () => {
        expect(
            resolveAdapter(
                { adapter: "ollama" },
                { EVAL_ADAPTER: "openrouter" },
            ),
        ).toBe("ollama");
    });

    it("honors EVAL_ADAPTER from the environment", () => {
        expect(resolveAdapter({}, { EVAL_ADAPTER: "ollama" })).toBe("ollama");
    });

    it("infers ollama from a native :11434 baseURL (no /v1 shim)", () => {
        expect(resolveAdapter({ baseURL: "http://localhost:11434" }, {})).toBe(
            "ollama",
        );
    });

    it("treats a :11434/v1 baseURL as the OpenAI-compat shim (openrouter)", () => {
        expect(
            resolveAdapter({ baseURL: "http://localhost:11434/v1" }, {}),
        ).toBe("openrouter");
    });

    it("defaults to openrouter when nothing hints otherwise", () => {
        expect(resolveAdapter({}, {})).toBe("openrouter");
    });
});

describe("createEvalModel", () => {
    it("builds a ChatOllama for the ollama adapter (no api key needed)", () => {
        const model = createEvalModel(
            { model: "qwen3:4b", baseURL: "http://localhost:11434" },
            { EVAL_ADAPTER: "ollama" },
        );
        expect(model).toBeInstanceOf(ChatOllama);
    });

    it("builds a ChatOpenAI (OpenRouter) for the openrouter adapter", () => {
        const model = createEvalModel(
            { apiKey: "k", model: "openai/gpt-oss-120b:free" },
            {},
        );
        expect(model).toBeInstanceOf(ChatOpenAI);
    });
});
