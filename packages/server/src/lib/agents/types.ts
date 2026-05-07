/**
 * External agent registry types.
 *
 * @module agents/types
 */

import type {
    CapabilityId,
    Metadata,
    NodeId,
    Result,
    RoleDefinition,
    RoleId,
} from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import type { ConnectionId, ExternalAgentId, TransportId } from "../types.js";

/**
 * External agent lifecycle status.
 */
export type ExternalAgentStatus =
    | "registered"
    | "connecting"
    | "connected"
    | "unavailable"
    | "disconnected"
    | "failed";

/**
 * Descriptor for an agent managed outside the local graph.
 */
export interface ExternalAgentDescriptor {
    /** External registry identifier */
    readonly id: ExternalAgentId;
    /** Node identifier used when the agent is represented in a graph */
    readonly nodeId: NodeId;
    /** Optional role definition advertised by the external agent */
    readonly role?: RoleDefinition;
    /** Capability identifiers advertised by the external agent */
    readonly capabilities: readonly CapabilityId[];
    /** Transport used to reach the external agent */
    readonly transportId?: TransportId;
    /** Active connection to the external agent, if any */
    readonly connectionId?: ConnectionId;
    /** Network or transport endpoint for the external agent */
    readonly endpoint?: string;
    /** Current external agent status */
    readonly status: ExternalAgentStatus;
    /** Additional descriptor metadata */
    readonly metadata: Metadata;
}

/**
 * Query filters for external agent listings.
 */
export interface ExternalAgentQuery {
    /** Match a specific agent status */
    readonly status?: ExternalAgentStatus;
    /** Match a specific role identifier */
    readonly roleId?: RoleId;
    /** Require all listed capabilities */
    readonly capabilities?: readonly CapabilityId[];
    /** Match a specific transport */
    readonly transportId?: TransportId;
}

/**
 * Aggregate view of registered external agents.
 */
export interface ExternalAgentSnapshot {
    /** Total number of registered external agents */
    readonly totalAgents: number;
    /** Count of agents grouped by status */
    readonly agentsByStatus: ReadonlyMap<ExternalAgentStatus, number>;
}

/**
 * Immutable registry for external agent descriptors.
 */
export interface ExternalAgentRegistry {
    /**
     * Registers an external agent descriptor.
     *
     * @param agent - Descriptor to register
     * @returns A new registry on success or a server error on failure
     */
    register(
        agent: ExternalAgentDescriptor,
    ): Result<ExternalAgentRegistry, ServerError>;

    /**
     * Updates an external agent descriptor.
     *
     * @param id - Descriptor identifier to update
     * @param patch - Partial descriptor values to merge
     * @returns A new registry on success or a server error on failure
     */
    update(
        id: ExternalAgentId,
        patch: Partial<ExternalAgentDescriptor>,
    ): Result<ExternalAgentRegistry, ServerError>;

    /**
     * Gets an external agent descriptor by registry identifier.
     *
     * @param id - Descriptor identifier
     * @returns Matching descriptor if registered
     */
    get(id: ExternalAgentId): ExternalAgentDescriptor | undefined;

    /**
     * Gets an external agent descriptor by graph node identifier.
     *
     * @param nodeId - Graph node identifier
     * @returns Matching descriptor if registered
     */
    getByNodeId(nodeId: NodeId): ExternalAgentDescriptor | undefined;

    /**
     * Lists registered external agents matching optional query filters.
     *
     * @param query - Optional filters to apply
     * @returns Matching descriptors
     */
    list(query?: ExternalAgentQuery): readonly ExternalAgentDescriptor[];

    /**
     * Removes an external agent descriptor.
     *
     * @param id - Descriptor identifier to remove
     * @returns A new registry on success or a server error on failure
     */
    unregister(id: ExternalAgentId): Result<ExternalAgentRegistry, ServerError>;

    /**
     * Creates an aggregate snapshot of the registry.
     *
     * @returns Snapshot with total and per-status counts
     */
    snapshot(): ExternalAgentSnapshot;
}
