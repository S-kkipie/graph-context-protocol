import { marketplaceScenario } from "@graph-context-protocol/agent-core";
import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { describe, expect, it } from "vitest";
import {
    createTokenCountingModel,
    taskSuccess,
    usageTokens,
} from "./behavioral";

const baseArt = {
    coupling: { peersKnown: 0, connectionsOpened: 0, messagesSent: 0 },
    toolTranscript: [],
    auditEvents: [] as never,
};

describe("taskSuccess", () => {
    it("delegates to the scenario success predicate", () => {
        const s = marketplaceScenario(2);
        const cheapest = s.knowledgeNodes[s.knowledgeNodes.length - 1];
        const price = cheapest.content.match(/\$(\d+)/)?.[1];
        const id = cheapest.nodeId.split("-").pop();
        expect(
            taskSuccess(s, { ...baseArt, answer: `${id} at $${price}` }),
        ).toBe(true);
        expect(taskSuccess(s, { ...baseArt, answer: "nope" })).toBe(false);
    });
});

describe("usageTokens", () => {
    it("reads usage_metadata.total_tokens", () => {
        const m = new AIMessage({ content: "x" });
        // biome-ignore lint/suspicious/noExplicitAny: attaching provider metadata
        (m as any).usage_metadata = { total_tokens: 42 };
        expect(usageTokens(m)).toBe(42);
    });
    it("falls back to response_metadata prompt+completion", () => {
        const m = new AIMessage({ content: "x" });
        // biome-ignore lint/suspicious/noExplicitAny: attaching provider metadata
        (m as any).response_metadata = {
            usage: { prompt_tokens: 5, completion_tokens: 7 },
        };
        expect(usageTokens(m)).toBe(12);
    });
    it("returns 0 when no usage is present", () => {
        expect(usageTokens(new AIMessage({ content: "x" }))).toBe(0);
    });
});

describe("createTokenCountingModel", () => {
    it("wraps the inner model and starts at zero", () => {
        // A non-network model: construction only, never invoked here.
        const inner = new ChatOpenAI({ apiKey: "test-key", model: "x" });
        const counter = createTokenCountingModel(inner);
        expect(counter.model).toBe(inner);
        expect(counter.total()).toBe(0);
    });

    it("accumulates tokens via handleLLMEnd", () => {
        const inner = new ChatOpenAI({ apiKey: "test-key", model: "x" });
        const counter = createTokenCountingModel(inner);
        // biome-ignore lint/suspicious/noExplicitAny: reaching installed callback
        const handler = (inner.callbacks as any[])[0];

        const msg1 = new AIMessage({ content: "y" });
        // biome-ignore lint/suspicious/noExplicitAny: attaching provider metadata
        (msg1 as any).usage_metadata = { total_tokens: 10 };
        handler.handleLLMEnd({ generations: [[{ message: msg1 }]] });
        expect(counter.total()).toBe(10);

        const msg2 = new AIMessage({ content: "z" });
        // biome-ignore lint/suspicious/noExplicitAny: attaching provider metadata
        (msg2 as any).usage_metadata = { total_tokens: 5 };
        handler.handleLLMEnd({ generations: [[{ message: msg2 }]] });
        expect(counter.total()).toBe(15);
    });
});
