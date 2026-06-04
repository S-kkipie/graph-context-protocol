import { describe, expect, it } from "vitest";
import { createNodeAgent } from "./node-agent";

describe("createNodeAgent", () => {
    it("builds a runnable react agent from config", () => {
        const agent = createNodeAgent({
            llm: { model: "openai/gpt-4o-mini", temperature: 0.7, apiKey: "test-key" },
            peers: [
                { peerUrl: "http://localhost:3001/api/gcp", targetNodeId: "knowledge:executor-context" },
            ],
            systemPrompt: "You are the test node.",
        });
        expect(typeof agent.stream).toBe("function");
        expect(typeof agent.invoke).toBe("function");
    });

    it("builds an agent with zero peers (no tools)", () => {
        const agent = createNodeAgent({
            llm: { apiKey: "test-key" },
            peers: [],
            systemPrompt: "No peers.",
        });
        expect(typeof agent.invoke).toBe("function");
    });

    it("throws when no API key is available", () => {
        const prev = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = "";
        try {
            expect(() =>
                createNodeAgent({ llm: {}, peers: [], systemPrompt: "x" }),
            ).toThrow(/OpenRouter API key/);
        } finally {
            if (prev === undefined) {
                delete process.env.OPENROUTER_API_KEY;
            } else {
                process.env.OPENROUTER_API_KEY = prev;
            }
        }
    });
});
