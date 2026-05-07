import { z } from "zod";
import type { RoleDefinition } from "../role/types";
import type { EdgeId, GraphId, Metadata, NodeId, Timestamp } from "../types";

/**
 * Graph types and schemas.
 *
 * @module graph/types
 */

/**
 * Represents a node in the graph context protocol.
 * Nodes are immutable and context-aware.
 */
export interface GraphNode {
    readonly id: NodeId;
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
 * Zod schema for EdgeType validation.
 */
export const EdgeTypeSchema = z.enum([
    "can-access",
    "can-modify",
    "can-traverse",
    "depends-on",
    "notifies",
    "custom",
]);

/**
 * Types of relationships that can exist between nodes.
 */
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/**
 * Represents a directed edge between two nodes in the graph.
 */
export interface GraphEdge {
    readonly id: EdgeId;
    readonly source: NodeId;
    readonly target: NodeId;
    readonly type: EdgeType;
    readonly metadata: Metadata;
    readonly createdAt: Timestamp;
    readonly bidirectional: boolean;
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
