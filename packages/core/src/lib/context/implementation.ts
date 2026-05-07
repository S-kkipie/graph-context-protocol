import type { GraphNode } from "../graph/types";
import type { RoleDefinition } from "../role/types";
import type { ContextId, GraphId, Metadata, NodeId } from "../types";
import type {
    ContextData,
    ContextFilter,
    GraphContext,
    PropagationResult,
} from "./types";

/**
 * Context implementation functions.
 *
 * @module context/implementation
 */

/**
 * Creates a new context.
 *
 * @param id - Unique identifier for the context
 * @param graphId - ID of the graph this context belongs to
 * @param currentNode - ID of the current node
 * @param role - Role of the entity creating this context
 * @param data - Initial context data
 * @param metadata - Optional metadata
 * @returns A new GraphContext instance
 */
export function createContext(
    id: ContextId,
    graphId: GraphId,
    currentNode: NodeId,
    role: RoleDefinition,
    data: ContextData = {},
    metadata: Metadata = {},
): GraphContext {
    return {
        id,
        graphId,
        currentNode,
        accumulatedData: data,
        role,
        metadata,
        createdAt: new Date().toISOString(),
        path: [currentNode],
    };
}

/**
 * Creates a context filter.
 *
 * @param field - The field to filter
 * @param operation - Type of filter operation
 * @param value - Optional value for the operation
 * @returns A new ContextFilter instance
 */
export function createContextFilter(
    field: string,
    operation: "include" | "exclude" | "transform",
    value?: unknown,
): ContextFilter {
    return {
        field,
        operation,
        value,
    };
}

/**
 * Propagates context to a target node.
 *
 * @param context - The context to propagate
 * @param targetNode - The node to propagate to
 * @param filters - Filters to apply during propagation
 * @returns Result of the propagation
 */
export function propagateContext(
    context: GraphContext,
    targetNode: GraphNode,
    filters: readonly ContextFilter[] = [],
): PropagationResult {
    const canAccess = targetNode.role.contextRules.some(
        (rule) =>
            rule.access !== "none" &&
            context.accumulatedData[rule.path] !== undefined,
    );

    if (!canAccess) {
        return {
            sourceContext: context,
            targetNode,
            propagatedContext: context,
            filtersApplied: filters,
            success: false,
            error: "Target node does not have access to context data",
        };
    }

    const filteredData = applyFilters(context.accumulatedData, filters);
    const propagatedContext: GraphContext = {
        ...context,
        currentNode: targetNode.id,
        accumulatedData: filteredData,
        path: [...context.path, targetNode.id],
    };

    return {
        sourceContext: context,
        targetNode,
        propagatedContext,
        filtersApplied: filters,
        success: true,
    };
}

/**
 * Applies filters to context data.
 *
 * @param data - The context data to filter
 * @param filters - Filters to apply
 * @returns Filtered context data
 */
function applyFilters(
    data: ContextData,
    filters: readonly ContextFilter[],
): ContextData {
    let result = { ...data };

    for (const filter of filters) {
        if (filter.operation === "exclude") {
            const { [filter.field]: _, ...rest } = result;
            result = rest;
        }
    }

    return result;
}

/**
 * Validates that context data complies with role rules.
 *
 * @param context - The context to validate
 * @returns True if valid, false otherwise
 */
export function validateContext(context: GraphContext): boolean {
    const { role, accumulatedData } = context;

    for (const rule of role.contextRules) {
        if (
            rule.access === "none" &&
            accumulatedData[rule.path] !== undefined
        ) {
            return false;
        }
    }

    return true;
}
