import {
    createAgent,
    createAgentNode,
    createDiscoverAgentsTool,
    createGraph,
    createGraphInfoTool,
    createRole,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toLangChainTool, toLangChainTools } from "./adapter";

function createTestRole(id: string) {
    return createRole(id, "Test", "Test role", [], []);
}

function createTestAgentNode(id: string) {
    return createAgentNode(id, createTestRole(`role:${id}`));
}

function createTestContext(agentNode: ReturnType<typeof createTestAgentNode>) {
    return {
        graph: createGraph("graph:test").addNode(agentNode),
        agentNode,
    };
}

describe("langgraph adapter", () => {
    describe("toLangChainTool", () => {
        it("should convert a GCP tool to LangChain tool", () => {
            const agentNode = createTestAgentNode("agent:1");
            const gcpTool = createGraphInfoTool();
            const getContext = vi.fn(() => createTestContext(agentNode));

            const langTool = toLangChainTool(gcpTool, getContext);

            expect(langTool.name).toBe("graph_info");
            expect(langTool.description).toBe(gcpTool.description);
            expect(typeof langTool.invoke).toBe("function");
        });

        it("should execute tool through LangChain interface", async () => {
            const agentNode = createTestAgentNode("agent:1");
            const gcpTool = createGraphInfoTool();
            const getContext = vi.fn(() => createTestContext(agentNode));

            const langTool = toLangChainTool(gcpTool, getContext);
            const result = await langTool.invoke({});

            expect(result).toBeDefined();
            expect(getContext).toHaveBeenCalled();
        });

        it("should propagate errors on tool failure", async () => {
            const agentNode = createTestAgentNode("agent:1");
            const gcpTool = {
                name: "failing_tool",
                description: "Always fails",
                parameters: z.object({}),
                async execute() {
                    return { success: false, error: "Intentional failure" };
                },
            };
            const getContext = vi.fn(() => createTestContext(agentNode));

            const langTool = toLangChainTool(gcpTool, getContext);
            await expect(langTool.invoke({})).rejects.toThrow(
                "Intentional failure",
            );
        });
    });

    describe("toLangChainTools", () => {
        it("should convert all agent tools", () => {
            const agentNode = createTestAgentNode("agent:1");
            const agent = createAgent(agentNode, [
                createDiscoverAgentsTool(),
                createGraphInfoTool(),
            ]);
            const getContext = vi.fn(() => createTestContext(agentNode));

            const tools = toLangChainTools(agent, getContext);

            expect(tools).toHaveLength(2);
            expect(tools[0].name).toBe("discover_agents");
            expect(tools[1].name).toBe("graph_info");
        });

        it("should return empty array for agent with no tools", () => {
            const agentNode = createTestAgentNode("agent:1");
            const agent = createAgent(agentNode);
            const getContext = vi.fn(() => createTestContext(agentNode));

            const tools = toLangChainTools(agent, getContext);

            expect(tools).toEqual([]);
        });
    });
});
