import { createAgentNode, createRole } from "@graph-context-protocol/core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it, vi } from "vitest";
import { createLangGraphAgent } from "./agent";

describe("agent", () => {
    function createTestLLM() {
        return {
            invoke: vi.fn(async () => ({
                content: "test response",
            })),
        } as unknown as BaseChatModel;
    }

    function createTestAgentNode(id: string) {
        const role = createRole(id, "Test", "Test role", [], []);
        return createAgentNode(id, role);
    }

    describe("createLangGraphAgent", () => {
        it("should create a compiled agent graph", () => {
            const node = createTestAgentNode("agent:test");
            const llm = createTestLLM();

            const agent = createLangGraphAgent({ node, llm });

            expect(agent).toBeDefined();
            expect(typeof agent.invoke).toBe("function");
        });

        it("should include converted GCP tools", () => {
            const node = createTestAgentNode("agent:test");
            const llm = createTestLLM();

            const agent = createLangGraphAgent({
                node,
                llm,
                extraTools: [],
            });

            expect(agent).toBeDefined();
        });

        it("should accept custom system prompt", () => {
            const node = createTestAgentNode("agent:test");
            const llm = createTestLLM();

            const agent = createLangGraphAgent({
                node,
                llm,
                systemPrompt: "Custom prompt",
            });

            expect(agent).toBeDefined();
        });

        it("should accept extra tools", () => {
            const node = createTestAgentNode("agent:test");
            const llm = createTestLLM();
            const extraTool = {
                name: "extra",
                description: "extra tool",
                schema: {},
            };

            const agent = createLangGraphAgent({
                node,
                llm,
                extraTools: [extraTool as never],
            });

            expect(agent).toBeDefined();
        });
    });
});
