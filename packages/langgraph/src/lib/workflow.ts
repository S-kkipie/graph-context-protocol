/**
 * Multi-agent workflow builder for LangGraph.
 *
 * Provides utilities to compose multiple LLM-powered agents into
 * a collaborative workflow using LangGraph's StateGraph.
 *
 * @module workflow
 */

import type { Graph } from "@graph-context-protocol/core";
import { END, START, StateGraph } from "@langchain/langgraph";
import { CollaborationState } from "./state";

/**
 * A node in the multi-agent workflow.
 */
export interface WorkflowAgentNode {
    /** Unique identifier used as the node key in the StateGraph */
    readonly id: string;
    /** The compiled LangGraph agent (from createLangGraphAgent) */
    readonly agent: unknown;
}

/**
 * Configuration for building a multi-agent collaboration workflow.
 */
export interface CollaborationWorkflowConfig {
    /** The GCP graph defining agent relationships and access control */
    readonly gcpGraph: Graph;
    /** Agent nodes to include in the workflow */
    readonly agents: readonly WorkflowAgentNode[];
    /** Starting agent ID */
    readonly startAgent: string;
    /** Max iterations before forcing END (default: 10) */
    readonly maxIterations?: number;
}

/**
 * Builds a StateGraph that routes between agents in a collaboration workflow.
 *
 * The workflow starts with the `startAgent`, then each agent's output
 * determines the next agent. If an agent signals completion or the
 * iteration limit is reached, the workflow ends.
 *
 * @param config - Workflow configuration
 * @returns Compiled StateGraph ready for invocation
 *
 * @example
 * ```typescript
 * const workflow = createCollaborationWorkflow({
 *   gcpGraph: myGraph,
 *   agents: [
 *     { id: "planner", agent: plannerAgent },
 *     { id: "researcher", agent: researcherAgent },
 *     { id: "writer", agent: writerAgent },
 *   ],
 *   startAgent: "planner",
 *   maxIterations: 10,
 * });
 *
 * const result = await workflow.invoke({
 *   messages: [new HumanMessage("Write a blog post about GCP")],
 *   gcpGraph: myGraph,
 * });
 * ```
 */
export function createCollaborationWorkflow(
    config: CollaborationWorkflowConfig,
) {
    const { agents, startAgent, maxIterations = 10 } = config;
    const agentIds = new Set(agents.map((a) => a.id));

    const builder = new StateGraph(CollaborationState);

    for (const { id, agent } of agents) {
        builder.addNode(id, agent as never);
    }

    builder.addEdge(START, startAgent as never);

    for (const { id } of agents) {
        builder.addConditionalEdges(id as never, (state) =>
            routeToNextAgent(state, agentIds, maxIterations),
        );
    }

    return builder.compile();
}

/**
 * Routing function that decides which agent acts next.
 *
 * Checks iteration limits and routes to the next agent or END.
 * Agents communicate their target via the `nextAgent` field in state.
 */
function routeToNextAgent(
    state: typeof CollaborationState.State,
    agentIds: Set<string>,
    maxIterations: number,
): string {
    if (state.iteration >= maxIterations) {
        return END;
    }

    const next = state.nextAgent;

    if (!next || !agentIds.has(next)) {
        return END;
    }

    return next;
}
