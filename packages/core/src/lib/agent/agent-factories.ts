import { z } from "zod";
import { discoverAgents, discoverKnowledge } from "../discovery";
import type { DiscoveryFilters } from "../discovery/discovery-types";
import { isAgentNode } from "../graph/graph-type-guards";
import type { AgentNode } from "../graph/graph-types";
import { createMessageHeader, createProtocolMessage } from "../protocol";
import type { Metadata } from "../types";
import { MetadataSchema } from "../types";
import type {
    Agent,
    AgentContext,
    AgentTool,
    AgentToolResult,
} from "./agent-types";

export const CreateAgentInputSchema = z.object({
    metadata: MetadataSchema.default({}),
});

export function createAgent(
    node: AgentNode,
    tools: readonly AgentTool[] = [],
    metadata: Metadata = {},
): Agent {
    if (!isAgentNode(node)) {
        throw new Error("Expected AgentNode");
    }

    const input = CreateAgentInputSchema.parse({ metadata });
    const createdAt = new Date().toISOString();
    const toolMap = new Map<string, AgentTool>();

    for (const tool of tools) {
        toolMap.set(tool.name, tool);
    }

    return {
        id: node.id,
        node,
        tools: toolMap,
        metadata: input.metadata,
        createdAt,

        withTool(tool: AgentTool): Agent {
            return createAgent(
                node,
                [
                    ...Array.from(this.tools.values()).filter(
                        (t) => t.name !== tool.name,
                    ),
                    tool,
                ],
                this.metadata,
            );
        },

        withoutTool(name: string): Agent {
            return createAgent(
                node,
                Array.from(this.tools.values()).filter((t) => t.name !== name),
                this.metadata,
            );
        },

        withMetadata(newMetadata: Metadata): Agent {
            return createAgent(node, Array.from(this.tools.values()), {
                ...this.metadata,
                ...newMetadata,
            });
        },

        async executeTool(
            name: string,
            input: unknown,
            ctx: AgentContext,
        ): Promise<AgentToolResult> {
            const tool = this.tools.get(name);
            if (!tool) {
                return {
                    success: false,
                    error: `Tool "${name}" not found`,
                };
            }

            try {
                const validated = tool.parameters.parse(input);
                return await tool.execute(validated, ctx);
            } catch (error) {
                return {
                    success: false,
                    error:
                        error instanceof Error ? error.message : String(error),
                };
            }
        },
    };
}

const DiscoverAgentsParamsSchema = z.object({
    maxDepth: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum graph traversal depth (default: 10)"),
    capabilities: z
        .array(z.string())
        .optional()
        .describe("Filter by required capability IDs"),
    roleIds: z.array(z.string()).optional().describe("Filter by role IDs"),
});

export function createDiscoverAgentsTool(): AgentTool<
    z.infer<typeof DiscoverAgentsParamsSchema>
> {
    return {
        name: "discover_agents",
        description:
            "Discover other agents reachable from this agent in the graph. Returns agent IDs, roles, and distances.",
        parameters: DiscoverAgentsParamsSchema,
        async execute(input: unknown, ctx): Promise<AgentToolResult> {
            const params = DiscoverAgentsParamsSchema.parse(input);
            const filters: DiscoveryFilters = {
                ...(params.capabilities
                    ? { capabilities: params.capabilities }
                    : {}),
                ...(params.roleIds ? { roleIds: params.roleIds } : {}),
            };

            const result = discoverAgents(ctx.graph, ctx.agentNode.id, filters);
            return {
                success: true,
                data: {
                    agents: result.nodes.map((n) => ({
                        id: n.node.id,
                        role: n.node.role.id,
                        distance: n.distance,
                        path: n.path,
                    })),
                    denied: result.denied,
                },
            };
        },
    };
}

const DiscoverKnowledgeParamsSchema = z.object({
    maxDepth: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum graph traversal depth (default: 10)"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    tagMode: z
        .enum(["any", "all"])
        .optional()
        .describe("Tag matching mode: 'any' or 'all' (default: 'any')"),
    contentTypes: z
        .array(z.string())
        .optional()
        .describe("Filter by content MIME types"),
    sources: z
        .array(z.string())
        .optional()
        .describe("Filter by knowledge sources"),
});

export function createDiscoverKnowledgeTool(): AgentTool<
    z.infer<typeof DiscoverKnowledgeParamsSchema>
> {
    return {
        name: "discover_knowledge",
        description:
            "Discover knowledge nodes (documents, data) reachable from this agent. Filter by tags, content type, or source.",
        parameters: DiscoverKnowledgeParamsSchema,
        async execute(input: unknown, ctx): Promise<AgentToolResult> {
            const params = DiscoverKnowledgeParamsSchema.parse(input);
            const filters: DiscoveryFilters = {
                ...(params.tags ? { tags: params.tags } : {}),
                ...(params.tagMode ? { tagMode: params.tagMode } : {}),
                ...(params.contentTypes
                    ? { contentTypes: params.contentTypes }
                    : {}),
                ...(params.sources ? { sources: params.sources } : {}),
            };

            const result = discoverKnowledge(
                ctx.graph,
                ctx.agentNode.id,
                filters,
            );
            return {
                success: true,
                data: {
                    knowledge: result.nodes.map((n) => ({
                        id: n.node.id,
                        role: n.node.role.id,
                        metadata: n.node.metadata,
                        distance: n.distance,
                        path: n.path,
                    })),
                    denied: result.denied,
                },
            };
        },
    };
}

const SendMessageParamsSchema = z.object({
    targetAgentId: z.string().min(1).describe("ID of the target agent node"),
    messageType: z
        .enum([
            "context-request",
            "context-response",
            "action-request",
            "action-response",
            "notification",
            "error",
        ])
        .describe("Type of protocol message"),
    payload: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Message payload data"),
    priority: z
        .enum(["low", "normal", "high", "critical"])
        .optional()
        .describe("Message priority (default: 'normal')"),
});

export function createSendMessageTool(): AgentTool<
    z.infer<typeof SendMessageParamsSchema>
> {
    return {
        name: "send_message",
        description:
            "Send a message to another agent in the graph. Requires a valid target agent ID.",
        parameters: SendMessageParamsSchema,
        async execute(input: unknown, ctx): Promise<AgentToolResult> {
            const params = SendMessageParamsSchema.parse(input);
            const target = ctx.graph.nodes.get(params.targetAgentId);
            if (!target) {
                return {
                    success: false,
                    error: `Target agent "${params.targetAgentId}" not found in graph`,
                };
            }
            if (!isAgentNode(target)) {
                return {
                    success: false,
                    error: `Target "${params.targetAgentId}" is not an agent`,
                };
            }

            const header = createMessageHeader(
                `msg:${Date.now()}`,
                ctx.agentNode.id,
                params.targetAgentId,
                params.messageType,
                { priority: params.priority ?? "normal" },
            );

            const message = createProtocolMessage(
                header,
                ctx.currentContext ?? {
                    id: `ctx:${Date.now()}`,
                    graphId: ctx.graph.id,
                    currentNode: ctx.agentNode.id,
                    accumulatedData: {},
                    role: ctx.agentNode.role,
                    metadata: {},
                    createdAt: new Date().toISOString(),
                    path: [ctx.agentNode.id],
                },
                params.payload ?? {},
            );

            return {
                success: true,
                data: {
                    messageId: message.header.messageId,
                    target: params.targetAgentId,
                    type: params.messageType,
                    timestamp: message.header.timestamp,
                },
            };
        },
    };
}

export function createGraphInfoTool(): AgentTool {
    return {
        name: "graph_info",
        description:
            "Get information about the current graph: node count, edge count, and connected nodes.",
        parameters: z.object({}),
        async execute(_input: unknown, ctx): Promise<AgentToolResult> {
            const connectedEdges = ctx.graph.getNodeEdges(ctx.agentNode.id);
            const connectedNodes = connectedEdges.map((edge) => {
                const otherId =
                    edge.source === ctx.agentNode.id
                        ? edge.target
                        : edge.source;
                const other = ctx.graph.nodes.get(otherId);
                return {
                    nodeId: otherId,
                    edgeType: edge.type,
                    nodeKind: other?.kind ?? "unknown",
                };
            });

            return {
                success: true,
                data: {
                    graphId: ctx.graph.id,
                    nodeCount: ctx.graph.nodes.size,
                    edgeCount: ctx.graph.edges.size,
                    connectedNodes,
                },
            };
        },
    };
}
