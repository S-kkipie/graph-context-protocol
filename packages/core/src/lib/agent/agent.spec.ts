import { describe, expect, it } from "vitest";
import { createGraph } from "../graph";
import { createAgentNode } from "../graph";
import type { AgentNode } from "../graph/types";
import { createRole } from "../role";
import {
    createAgent,
    createDiscoverAgentsTool,
    createDiscoverKnowledgeTool,
    createGraphInfoTool,
    createSendMessageTool,
} from "./implementation";
import type { AgentContext } from "./types";

function createTestRole(id: string) {
    return createRole(id, "Test", "Test role", [], []);
}

function createTestAgentNode(id: string): AgentNode {
    return createAgentNode(id, createTestRole(`role:${id}`));
}

function createTestContext(agentNode: AgentNode): AgentContext {
    const graph = createGraph("graph:test").addNode(agentNode);
    return {
        graph,
        agentNode,
    };
}

describe("agent module", () => {
    describe("createAgent", () => {
        it("should create agent with valid node", () => {
            const node = createTestAgentNode("agent:1");
            const agent = createAgent(node);

            expect(agent.id).toBe("agent:1");
            expect(agent.node).toBe(node);
            expect(agent.tools.size).toBe(0);
            expect(agent.metadata).toEqual({});
            expect(agent.createdAt).toBeDefined();
        });

        it("should create agent with initial tools", () => {
            const node = createTestAgentNode("agent:1");
            const tool = createDiscoverAgentsTool();
            const agent = createAgent(node, [tool]);

            expect(agent.tools.size).toBe(1);
            expect(agent.tools.get("discover_agents")).toBe(tool);
        });

        it("should create agent with metadata", () => {
            const node = createTestAgentNode("agent:1");
            const agent = createAgent(node, [], { version: "1.0" });

            expect(agent.metadata).toEqual({ version: "1.0" });
        });

        it("should reject non-agent nodes", async () => {
            const { createNode } = await import("../graph");
            const node = createNode("node:1", createTestRole("role:test"));
            expect(() => createAgent(node as AgentNode)).toThrow(
                "Expected AgentNode",
            );
        });
    });

    describe("Agent.withTool", () => {
        it("should add a new tool", () => {
            const node = createTestAgentNode("agent:1");
            const agent = createAgent(node);
            const tool = createDiscoverAgentsTool();

            const updated = agent.withTool(tool);

            expect(updated.tools.size).toBe(1);
            expect(updated.tools.get("discover_agents")).toBe(tool);
            expect(agent.tools.size).toBe(0);
        });

        it("should replace existing tool with same name", () => {
            const node = createTestAgentNode("agent:1");
            const tool1 = createDiscoverAgentsTool();
            const agent = createAgent(node, [tool1]);

            const tool2 = {
                ...createDiscoverAgentsTool(),
                description: "Updated description",
            };
            const updated = agent.withTool(tool2);

            expect(updated.tools.size).toBe(1);
            expect(updated.tools.get("discover_agents")?.description).toBe(
                "Updated description",
            );
        });
    });

    describe("Agent.withoutTool", () => {
        it("should remove a tool", () => {
            const node = createTestAgentNode("agent:1");
            const tool = createDiscoverAgentsTool();
            const agent = createAgent(node, [tool]);

            const updated = agent.withoutTool("discover_agents");

            expect(updated.tools.size).toBe(0);
            expect(agent.tools.size).toBe(1);
        });

        it("should be no-op when tool does not exist", () => {
            const node = createTestAgentNode("agent:1");
            const agent = createAgent(node);

            const updated = agent.withoutTool("nonexistent");

            expect(updated.tools.size).toBe(0);
        });
    });

    describe("Agent.withMetadata", () => {
        it("should merge metadata", () => {
            const node = createTestAgentNode("agent:1");
            const agent = createAgent(node, [], { key1: "value1" });

            const updated = agent.withMetadata({ key2: "value2" });

            expect(updated.metadata).toEqual({
                key1: "value1",
                key2: "value2",
            });
            expect(agent.metadata).toEqual({ key1: "value1" });
        });
    });

    describe("Agent.executeTool", () => {
        it("should execute a tool successfully", async () => {
            const node = createTestAgentNode("agent:1");
            const tool = createGraphInfoTool();
            const agent = createAgent(node, [tool]);
            const ctx = createTestContext(node);

            const result = await agent.executeTool("graph_info", {}, ctx);

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });

        it("should fail for unknown tool", async () => {
            const node = createTestAgentNode("agent:1");
            const agent = createAgent(node);
            const ctx = createTestContext(node);

            const result = await agent.executeTool("unknown", {}, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain("not found");
        });

        it("should fail for invalid parameters", async () => {
            const node = createTestAgentNode("agent:1");
            const tool = createSendMessageTool();
            const agent = createAgent(node, [tool]);
            const ctx = createTestContext(node);

            const result = await agent.executeTool(
                "send_message",
                { invalid: "data" },
                ctx,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe("createDiscoverAgentsTool", () => {
        it("should discover agents in graph", async () => {
            const agent1 = createTestAgentNode("agent:1");
            const agent2 = createTestAgentNode("agent:2");
            const graph = createGraph("graph:test")
                .addNode(agent1)
                .addNode(agent2);

            const tool = createDiscoverAgentsTool();
            const ctx = createTestContext(agent1);

            const result = await tool.execute({}, { ...ctx, graph });

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    describe("createDiscoverKnowledgeTool", () => {
        it("should discover knowledge in graph", async () => {
            const { createKnowledgeNode } = await import("../graph");
            const agent1 = createTestAgentNode("agent:1");
            const knowledge = createKnowledgeNode(
                "knowledge:1",
                createTestRole("role:k"),
                {
                    tags: ["docs"],
                },
            );
            const graph = createGraph("graph:test")
                .addNode(agent1)
                .addNode(knowledge);

            const tool = createDiscoverKnowledgeTool();
            const ctx = createTestContext(agent1);

            const result = await tool.execute(
                { tags: ["docs"] },
                { ...ctx, graph },
            );

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    describe("createSendMessageTool", () => {
        it("should create a message to another agent", async () => {
            const agent1 = createTestAgentNode("agent:1");
            const agent2 = createTestAgentNode("agent:2");
            const graph = createGraph("graph:test")
                .addNode(agent1)
                .addNode(agent2);

            const tool = createSendMessageTool();
            const ctx = createTestContext(agent1);

            const result = await tool.execute(
                {
                    targetAgentId: "agent:2",
                    messageType: "notification",
                    payload: { hello: "world" },
                },
                { ...ctx, graph },
            );

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });

        it("should fail for non-existent target", async () => {
            const agent1 = createTestAgentNode("agent:1");
            const graph = createGraph("graph:test").addNode(agent1);

            const tool = createSendMessageTool();
            const ctx = createTestContext(agent1);

            const result = await tool.execute(
                {
                    targetAgentId: "agent:missing",
                    messageType: "notification",
                },
                { ...ctx, graph },
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("not found");
        });
    });

    describe("createGraphInfoTool", () => {
        it("should return graph statistics", async () => {
            const agent1 = createTestAgentNode("agent:1");
            const graph = createGraph("graph:test").addNode(agent1);

            const tool = createGraphInfoTool();
            const ctx = createTestContext(agent1);

            const result = await tool.execute({}, { ...ctx, graph });

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                graphId: "graph:test",
                nodeCount: 1,
                edgeCount: 0,
                connectedNodes: [],
            });
        });
    });
});
