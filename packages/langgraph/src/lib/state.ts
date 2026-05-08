/**
 * State annotations for LangGraph multi-agent workflows.
 *
 * Defines the shared state schema used by the collaboration graph.
 *
 * @module state
 */

import type { Graph } from "@graph-context-protocol/core";
import type { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

/**
 * Shared state for a multi-agent collaboration workflow.
 *
 * - `messages`: Conversation history (LangGraph standard)
 * - `gcpGraph`: The Graph Context Protocol graph representing agent relationships
 * - `currentAgent`: ID of the agent that just acted
 * - `nextAgent`: ID of the agent that should act next (null = end workflow)
 * - `iteration`: Round counter to prevent infinite loops
 */
export const CollaborationState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    gcpGraph: Annotation<Graph>(),
    currentAgent: Annotation<string>({
        reducer: (_x, y) => y,
    }),
    nextAgent: Annotation<string | null>({
        reducer: (_x, y) => y,
        default: () => null,
    }),
    iteration: Annotation<number>({
        reducer: (_x, y) => y,
        default: () => 0,
    }),
});

/** Type of the collaboration workflow state */
export type CollaborationState = typeof CollaborationState.State;
