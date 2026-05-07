/**
 * Discovery module for Graph Context Protocol.
 * Provides query/discovery capabilities for agents to find other agents and knowledge.
 *
 * @module discovery/types
 */

import type { AgentNode, EdgeType, GraphNode, NodeKind } from "../graph/types";
import type { CapabilityId, Metadata, NodeId, RoleId } from "../types";

/**
 * Query parameters for discovery operations.
 */
export interface DiscoveryQuery {
    /** Filter by node kinds (agent, knowledge, etc.) */
    readonly kinds?: readonly NodeKind[];
    /** Maximum traversal depth from requester (default: 10) */
    readonly maxDepth?: number;
    /** Which edge types to follow during traversal */
    readonly edgeTypes?: readonly EdgeType[];
    /** Additional filters for nodes */
    readonly filters?: DiscoveryFilters;
}

/**
 * Filters for discovery results.
 */
export interface DiscoveryFilters {
    /** Filter by specific node IDs */
    readonly nodeIds?: readonly NodeId[];
    /** Filter by metadata key-value pairs */
    readonly metadata?: Metadata;
    /** Filter by role IDs */
    readonly roleIds?: readonly RoleId[];
    /** Filter by capabilities (agent nodes only) */
    readonly capabilities?: readonly CapabilityId[];
    /** Filter by tags (knowledge nodes only) */
    readonly tags?: readonly string[];
    /** Tag matching mode: "any" = at least one tag, "all" = all tags required */
    readonly tagMode?: "any" | "all";
    /** Filter by content types (knowledge nodes only) */
    readonly contentTypes?: readonly string[];
    /** Filter by sources (knowledge nodes only) */
    readonly sources?: readonly string[];
}

/**
 * A discovered node with path information.
 */
export interface DiscoveredNode<T extends GraphNode> {
    /** The discovered node */
    readonly node: T;
    /** Path from requester to this node (inclusive) */
    readonly path: readonly NodeId[];
    /** Number of hops from requester */
    readonly distance: number;
}

/**
 * Result of a discovery operation.
 */
export interface DiscoveryResult<T extends GraphNode> {
    /** The agent that requested the discovery */
    readonly requester: AgentNode;
    /** Successfully discovered nodes */
    readonly nodes: readonly DiscoveredNode<T>[];
    /** Node IDs that were found but access was denied */
    readonly denied: readonly NodeId[];
}

/**
 * Error thrown during discovery operations.
 */
export class DiscoveryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DiscoveryError";
    }
}
