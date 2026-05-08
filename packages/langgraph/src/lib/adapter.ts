import type {
    Agent,
    AgentContext,
    AgentTool,
} from "@graph-context-protocol/core";
import type { StructuredTool } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";

/**
 * Converts a Graph Context Protocol AgentTool to a LangChain StructuredTool.
 *
 * The returned tool can be used directly with LangGraph agents (e.g.,
 * `createReactAgent`). Tool parameters are validated using the agent tool's
 * Zod schema before execution.
 *
 * @param agentTool - The GCP agent tool to convert
 * @param getContext - Function that returns the current AgentContext.
 *   Called fresh on each tool invocation so graph/context state is current.
 * @returns A LangChain StructuredTool compatible with LangGraph
 *
 * @example
 * ```typescript
 * const agent = createAgent(agentNode, [
 *   createDiscoverAgentsTool(),
 *   createDiscoverKnowledgeTool(),
 * ]);
 *
 * const langGraphTools = toLangChainTools(agent, () => ({
 *   graph: myGraph,
 *   agentNode: agent.node,
 * }));
 *
 * const reactAgent = createReactAgent({ llm, tools: langGraphTools });
 * ```
 */
export function toLangChainTool(
    agentTool: AgentTool,
    getContext: () => AgentContext,
): StructuredTool {
    return tool(
        async (input: unknown) => {
            const ctx = getContext();
            const result = await agentTool.execute(input, ctx);

            if (!result.success) {
                throw new Error(result.error ?? "Tool execution failed");
            }

            return result.data;
        },
        {
            name: agentTool.name,
            description: agentTool.description,
            schema: agentTool.parameters,
        },
    );
}

/**
 * Converts all tools from a GCP Agent into LangChain StructuredTools.
 *
 * @param agent - The GCP agent whose tools will be converted
 * @param getContext - Function that returns the current AgentContext
 * @returns Array of LangChain StructuredTools
 */
export function toLangChainTools(
    agent: Agent,
    getContext: () => AgentContext,
): StructuredTool[] {
    return Array.from(agent.tools.values()).map((t) =>
        toLangChainTool(t, getContext),
    );
}
