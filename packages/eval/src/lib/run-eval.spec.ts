import { describe, expect, it } from "vitest";
import { runFullEval } from "./run-eval";

describe("runFullEval gating", () => {
    it("refuses to run without RUN_EVAL + key", async () => {
        const prev = process.env.RUN_EVAL;
        delete process.env.RUN_EVAL;
        await expect(runFullEval()).rejects.toThrow("RUN_EVAL");
        if (prev !== undefined) process.env.RUN_EVAL = prev;
    });
});
