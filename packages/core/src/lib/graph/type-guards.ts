import {
    AccessEdge,
    BaseGraphEdge,
    CustomEdge,
    DependencyEdge,
    ModifyEdge,
    NotificationEdge,
    TraverseEdge,
} from "./implementation";
import type {
    AgentNode,
    BuiltInEdgeType,
    GraphEdge,
    GraphNode,
    KnowledgeNode,
} from "./types";

/**
 * Type guard for AccessEdge.
 */
export function isAccessEdge(edge: GraphEdge): edge is AccessEdge {
    return edge.type === "can-access" && edge instanceof AccessEdge;
}

/**
 * Type guard for ModifyEdge.
 */
export function isModifyEdge(edge: GraphEdge): edge is ModifyEdge {
    return edge.type === "can-modify" && edge instanceof ModifyEdge;
}

/**
 * Type guard for TraverseEdge.
 */
export function isTraverseEdge(edge: GraphEdge): edge is TraverseEdge {
    return edge.type === "can-traverse" && edge instanceof TraverseEdge;
}

/**
 * Type guard for DependencyEdge.
 */
export function isDependencyEdge(edge: GraphEdge): edge is DependencyEdge {
    return edge.type === "depends-on" && edge instanceof DependencyEdge;
}

/**
 * Type guard for NotificationEdge.
 */
export function isNotificationEdge(edge: GraphEdge): edge is NotificationEdge {
    return edge.type === "notifies" && edge instanceof NotificationEdge;
}

/**
 * Type guard for CustomEdge.
 */
export function isCustomEdge(edge: GraphEdge): edge is CustomEdge {
    return edge instanceof CustomEdge;
}

/**
 * Type guard for built-in edge types.
 */
export function isBuiltInEdge(
    edge: GraphEdge,
): edge is GraphEdge<BuiltInEdgeType> {
    return (
        isAccessEdge(edge) ||
        isModifyEdge(edge) ||
        isTraverseEdge(edge) ||
        isDependencyEdge(edge) ||
        isNotificationEdge(edge)
    );
}

/**
 * Type guard for BaseGraphEdge (any class-based edge).
 */
export function isBaseGraphEdge(edge: GraphEdge): edge is BaseGraphEdge {
    return edge instanceof BaseGraphEdge;
}

/**
 * Type guard for AgentNode.
 */
export function isAgentNode(node: GraphNode): node is AgentNode {
    return node.kind === "agent";
}

/**
 * Type guard for KnowledgeNode.
 */
export function isKnowledgeNode(node: GraphNode): node is KnowledgeNode {
    return node.kind === "knowledge";
}
