import type { GraphNode } from "../graph/graph-types";
import type { RoleDefinition } from "../role/role-types";
import type { ContextId, GraphId, Metadata, NodeId } from "../types";

/**
 * Context types.
 *
 * @module context/context-types
 */

/**
 * Represents context data that flows through the graph.
 */
export type ContextData = Record<string, unknown>;

/**
 * Represents a snapshot of context at a specific point in the graph.
 */
export interface GraphContext {
    readonly id: ContextId;
    readonly graphId: GraphId;
    readonly currentNode: NodeId;
    readonly accumulatedData: ContextData;
    readonly role: RoleDefinition;
    readonly metadata: Metadata;
    readonly createdAt: string;
    readonly path: readonly NodeId[];
}

/**
 * Filter applied during context propagation.
 */
export interface ContextFilter {
    readonly field: string;
    readonly operation: "include" | "exclude" | "transform";
    readonly value?: unknown;
}

/**
 * Result of context propagation operation.
 */
export interface PropagationResult {
    readonly sourceContext: GraphContext;
    readonly targetNode: GraphNode;
    readonly propagatedContext: GraphContext;
    readonly filtersApplied: readonly ContextFilter[];
    readonly success: boolean;
    readonly error?: string;
}

/**
 * Options for context propagation.
 */
export interface PropagationOptions {
    readonly maxDepth: number;
    readonly followBidirectional: boolean;
    readonly applyFilters: boolean;
}
