/**
 * Agent types and interfaces.
 *
 * Provides a framework-agnostic abstraction for agents that interact
 * with the Graph Context Protocol through tools.
 *
 * @module agent/agent-types
 */

import type { z } from "zod";
import type { GraphContext } from "../context/context-types";
import type { AgentNode, Graph } from "../graph/graph-types";
import type { Metadata, NodeId } from "../types";

/**
 * Result of executing an agent tool.
 */
export interface AgentToolResult {
    /** Whether the tool execution succeeded */
    readonly success: boolean;
    /** Tool output data on success */
    readonly data?: unknown;
    /** Error message on failure */
    readonly error?: string;
}

/**
 * Context passed to agent tool execution.
 * Provides access to the graph, agent node, and current context.
 */
export interface AgentContext {
    /** The graph this agent operates within */
    readonly graph: Graph;
    /** The agent's node in the graph */
    readonly agentNode: AgentNode;
    /** Current graph context if available */
    readonly currentContext?: GraphContext;
}

/**
 * A tool that an agent can use to interact with the graph.
 * Framework-agnostic — adapters convert this to framework-specific tools.
 */
export interface AgentTool<TInput = unknown> {
    /** Unique tool name */
    readonly name: string;
    /** Description for LLM/tool callers */
    readonly description: string;
    /** Zod schema for parameter validation */
    readonly parameters: z.ZodSchema<TInput>;
    /**
     * Execute the tool with validated parameters.
     *
     * @param input - Raw parameters (tool validates internally)
     * @param ctx - Agent context with graph access
     * @returns Tool execution result
     */
    execute(input: unknown, ctx: AgentContext): Promise<AgentToolResult>;
}

/**
 * An agent bound to an AgentNode with a set of tools.
 * Immutable — all modification methods return new instances.
 */
export interface Agent {
    /** Agent ID (same as bound node ID) */
    readonly id: NodeId;
    /** The graph node this agent is bound to */
    readonly node: AgentNode;
    /** Available tools keyed by name */
    readonly tools: ReadonlyMap<string, AgentTool>;
    /** Agent metadata */
    readonly metadata: Metadata;
    /** ISO 8601 creation timestamp */
    readonly createdAt: string;

    /**
     * Returns a new agent with an additional tool.
     * Replaces existing tool with same name.
     *
     * @param tool - Tool to add
     * @returns New agent instance
     */
    withTool(tool: AgentTool): Agent;

    /**
     * Returns a new agent without the specified tool.
     *
     * @param name - Tool name to remove
     * @returns New agent instance
     */
    withoutTool(name: string): Agent;

    /**
     * Returns a new agent with merged metadata.
     *
     * @param metadata - Metadata to merge
     * @returns New agent instance
     */
    withMetadata(metadata: Metadata): Agent;

    /**
     * Execute a tool by name with given parameters.
     *
     * @param name - Tool name
     * @param input - Tool parameters
     * @param ctx - Agent context
     * @returns Tool execution result
     */
    executeTool(
        name: string,
        input: unknown,
        ctx: AgentContext,
    ): Promise<AgentToolResult>;
}
