/**
 * LangGraph agent factory.
 *
 * Wraps a Graph Context Protocol agent node into a LangGraph
 * `createReactAgent` with an LLM and converted tools.
 *
 * @module agent
 */

import type { AgentContext, AgentNode } from "@graph-context-protocol/core";
import { createAgent } from "@graph-context-protocol/core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { toLangChainTools } from "./adapter";

/**
 * Configuration for creating a LangGraph-powered agent.
 */
export interface LangGraphAgentConfig {
    /** The GCP agent node this agent is bound to */
    readonly node: AgentNode;
    /** The LLM to use for reasoning (e.g., OpenRouter via ChatOpenAI) */
    readonly llm: BaseChatModel;
    /** Optional system prompt override */
    readonly systemPrompt?: string;
    /** Optional additional tools beyond the node's default tools */
    readonly extraTools?: StructuredTool[];
}

/**
 * Creates a LangGraph react agent from a GCP agent node.
 *
 * The agent is given the GCP node's role and capabilities as context,
 * and all of the node's tools are converted to LangChain tools.
 *
 * @param config - Agent configuration
 * @returns A compiled LangGraph agent that can be used as a node in a StateGraph
 *
 * @example
 * ```typescript
 * const agentNode = createAgentNode("agent:researcher", researcherRole);
 * const llm = createOpenRouterLLM({ model: "openai/gpt-4o" });
 *
 * const agent = createLangGraphAgent({
 *   node: agentNode,
 *   llm,
 *   systemPrompt: "You are a research specialist. Use tools to discover knowledge.",
 * });
 *
 * // Use in a StateGraph
 * const workflow = new StateGraph(CollaborationState)
 *   .addNode("researcher", agent)
 *   .addEdge("__start__", "researcher");
 * ```
 */
export function createLangGraphAgent(config: LangGraphAgentConfig) {
    const { node, llm, systemPrompt, extraTools = [] } = config;

    const agent = createAgent(node);

    const getContext = (): AgentContext => ({
        graph: config.node as unknown as AgentContext["graph"],
        agentNode: node,
    });

    const gcpTools = toLangChainTools(agent, getContext);
    const allTools = [...gcpTools, ...extraTools];

    const defaultPrompt = `You are an autonomous agent named "${node.id}".
Role: ${node.role.name}
Description: ${node.role.description}
Capabilities: ${node.role.capabilities.map((c) => c.id).join(", ") || "none"}

Use the available tools to interact with the graph and collaborate with other agents.
Always reason step by step before taking action.`;

    const messageModifier = systemPrompt ?? defaultPrompt;

    return createReactAgent({
        llm,
        tools: allTools,
        messageModifier: new SystemMessage(messageModifier),
    });
}
