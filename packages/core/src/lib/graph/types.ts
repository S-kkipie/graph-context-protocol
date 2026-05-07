import { z } from "zod";
import type { RoleDefinition } from "../role/types";
import type { EdgeId, GraphId, Metadata, NodeId, Timestamp } from "../types";

/**
 * Graph types and schemas.
 *
 * @module graph/types
 */

/**
 * Zod schema for built-in node kinds.
 */
export const BuiltInNodeKindSchema = z.enum([
    "agent",
    "knowledge",
    "context",
    "generic",
]);

/**
 * Built-in node kinds.
 */
export type BuiltInNodeKind = z.infer<typeof BuiltInNodeKindSchema>;

/**
 * Node kind - extensible string for custom node types.
 */
export type NodeKind = string;

/**
 * Represents a node in the graph context protocol.
 * Nodes are immutable and context-aware.
 */
export interface GraphNode {
    readonly id: NodeId;
    readonly kind: NodeKind;
    readonly role: RoleDefinition;
    readonly metadata: Metadata;
    readonly createdAt: Timestamp;

    /**
     * Creates a new node with an updated role.
     *
     * @param role - The new role to assign
     * @returns A new GraphNode instance with the updated role
     */
    withRole(role: RoleDefinition): GraphNode;

    /**
     * Creates a new node with updated metadata.
     *
     * @param metadata - Partial metadata to merge
     * @returns A new GraphNode instance with the updated metadata
     */
    withMetadata(metadata: Metadata): GraphNode;
}

/**
 * Agent node - represents an AI agent or autonomous actor.
 */
export interface AgentNode extends GraphNode {
    readonly kind: "agent";
}

/**
 * Knowledge node - represents information, documents, or data.
 */
export interface KnowledgeNode extends GraphNode {
    readonly kind: "knowledge";
}

/**
 * Zod schema for built-in edge types.
 * These are the predefined edge types in the system.
 */
export const BuiltInEdgeTypeSchema = z.enum([
    "can-access",
    "can-modify",
    "can-traverse",
    "depends-on",
    "notifies",
    "custom",
]);

/**
 * Built-in edge types for standard relationships.
 */
export type BuiltInEdgeType = z.infer<typeof BuiltInEdgeTypeSchema>;

/**
 * Zod schema for any edge type (extensible).
 * Allows custom edge types beyond built-ins.
 */
export const EdgeTypeSchema = z.string().min(1);

/**
 * Edge type - extensible string for custom edge types.
 */
export type EdgeType = string;

/**
 * Context for edge validation between nodes.
 */
export interface EdgeValidationContext {
    readonly source: GraphNode;
    readonly target: GraphNode;
}

/**
 * Serialized representation of a graph edge.
 * Used for storage and transmission.
 */
export interface SerializedGraphEdge {
    readonly version: 1;
    readonly id: EdgeId;
    readonly source: NodeId;
    readonly target: NodeId;
    readonly type: EdgeType;
    readonly metadata: Metadata;
    readonly createdAt: Timestamp;
    readonly bidirectional: boolean;
}

/**
 * Represents a directed edge between two nodes in the graph.
 * This is an extensible interface - custom edge types can implement it.
 */
export interface GraphEdge<TType extends string = string> {
    readonly id: EdgeId;
    readonly source: NodeId;
    readonly target: NodeId;
    readonly type: TType;
    readonly metadata: Metadata;
    readonly createdAt: Timestamp;
    readonly bidirectional: boolean;

    /**
     * Validates if this edge is valid between the given source and target nodes.
     * Each edge type implements its own validation logic.
     */
    isValidBetween(source: GraphNode, target: GraphNode): boolean;

    /**
     * Returns the edge type identifier.
     */
    getEdgeType(): TType;

    /**
     * Serializes the edge to a plain object.
     */
    toJSON(): SerializedGraphEdge;
}

/**
 * Configuration options for graph creation.
 */
export interface GraphConfig {
    readonly maxDepth: number;
    readonly allowCycles: boolean;
    readonly defaultRole: RoleDefinition;
}

/**
 * Represents a graph structure containing nodes and edges.
 */
export interface Graph {
    readonly id: GraphId;
    readonly nodes: ReadonlyMap<NodeId, GraphNode>;
    readonly edges: ReadonlyMap<EdgeId, GraphEdge>;
    readonly config: GraphConfig;

    /**
     * Adds a node to the graph.
     *
     * @param node - The node to add
     * @returns A new Graph with the node added
     */
    addNode(node: GraphNode): Graph;

    /**
     * Removes a node from the graph.
     *
     * @param nodeId - The ID of the node to remove
     * @returns A new Graph with the node removed
     */
    removeNode(nodeId: NodeId): Graph;

    /**
     * Adds an edge to the graph.
     *
     * @param edge - The edge to add
     * @returns A new Graph with the edge added
     */
    addEdge(edge: GraphEdge): Graph;

    /**
     * Removes an edge from the graph.
     *
     * @param edgeId - The ID of the edge to remove
     * @returns A new Graph with the edge removed
     */
    removeEdge(edgeId: EdgeId): Graph;

    /**
     * Gets all edges connected to a node.
     *
     * @param nodeId - The node ID
     * @returns Array of connected edges
     */
    getNodeEdges(nodeId: NodeId): readonly GraphEdge[];

    /**
     * Checks if a path exists between two nodes.
     *
     * @param source - Source node ID
     * @param target - Target node ID
     * @returns True if a path exists
     */
    hasPath(source: NodeId, target: NodeId): boolean;
}
