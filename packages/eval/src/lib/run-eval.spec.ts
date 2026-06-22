import { describe, expect, it } from "vitest";
import { buildLlmConfig, runFullEval } from "./run-eval";

describe("runFullEval gating", () => {
    it("refuses to run without RUN_EVAL + key", async () => {
        const prev = process.env.RUN_EVAL;
        try {
            delete process.env.RUN_EVAL;
            await expect(runFullEval()).rejects.toThrow("RUN_EVAL");
        } finally {
            if (prev !== undefined) process.env.RUN_EVAL = prev;
        }
    });
});

describe("buildLlmConfig", () => {
    it("prefers an explicit baseURL over EVAL_BASE_URL", () => {
        expect(
            buildLlmConfig("k", "m", "http://explicit/v1", {
                EVAL_BASE_URL: "http://env/v1",
            }),
        ).toEqual({ apiKey: "k", model: "m", baseURL: "http://explicit/v1" });
    });

    it("falls back to EVAL_BASE_URL when no explicit baseURL", () => {
        expect(
            buildLlmConfig("k", "m", undefined, {
                EVAL_BASE_URL: "http://localhost:11434/v1",
            }),
        ).toEqual({
            apiKey: "k",
            model: "m",
            baseURL: "http://localhost:11434/v1",
        });
    });

    it("omits baseURL entirely when neither is set (OpenRouter default)", () => {
        expect(buildLlmConfig("k", "m", undefined, {})).toEqual({
            apiKey: "k",
            model: "m",
        });
    });
});
