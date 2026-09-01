import { AIMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { describe, expect, it } from "vitest";
import {
    createEvalModel,
    resolveAdapter,
    stripUnnamedToolCalls,
} from "./model-factory";

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

    it("honors EVAL_ADAPTER=google from the environment", () => {
        expect(resolveAdapter({}, { EVAL_ADAPTER: "google" })).toBe("google");
    });

    it("prefers an explicit google adapter argument", () => {
        expect(
            resolveAdapter({ adapter: "google" }, { EVAL_ADAPTER: "ollama" }),
        ).toBe("google");
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

    it("builds a ChatGoogleGenerativeAI for the google adapter (native, no OpenAI shim)", () => {
        const model = createEvalModel(
            { apiKey: "k", model: "gemini-2.5-flash-lite" },
            { EVAL_ADAPTER: "google" },
        );
        expect(model).toBeInstanceOf(ChatGoogleGenerativeAI);
    });

    it("disables streaming on the google adapter (forces the sanitize path)", () => {
        const model = createEvalModel(
            { apiKey: "k", model: "gemini-2.5-flash-lite" },
            { EVAL_ADAPTER: "google" },
        );
        expect((model as { disableStreaming?: boolean }).disableStreaming).toBe(
            true,
        );
    });

    it("reads the google api key from GEMINI_API_KEY when not passed explicitly", () => {
        const model = createEvalModel(
            { model: "gemini-2.5-flash-lite" },
            { EVAL_ADAPTER: "google", GEMINI_API_KEY: "from-env" },
        );
        expect(model).toBeInstanceOf(ChatGoogleGenerativeAI);
    });
});

describe("stripUnnamedToolCalls", () => {
    it("drops a parallel tool call with an empty name, keeps the named one", () => {
        const msg = new AIMessage({
            content: "",
            tool_calls: [
                { name: "query_s0", args: { q: "price" }, id: "a" },
                { name: "", args: { q: "price" }, id: "b" },
            ],
        });
        const out = stripUnnamedToolCalls(msg);
        expect(out).not.toBe(msg);
        expect(out.tool_calls?.map((c) => c.id)).toEqual(["a"]);
    });

    it("returns the same message reference when every call has a name", () => {
        const msg = new AIMessage({
            content: "",
            tool_calls: [{ name: "query_s0", args: {}, id: "a" }],
        });
        expect(stripUnnamedToolCalls(msg)).toBe(msg);
    });

    it("returns the same message when there are no tool calls", () => {
        const msg = new AIMessage({ content: "hi" });
        expect(stripUnnamedToolCalls(msg)).toBe(msg);
    });
});
