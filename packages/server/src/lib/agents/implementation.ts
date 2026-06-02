/**
 * External agent registry implementation.
 *
 * @module agents/implementation
 */

import type {
    AgentNode,
    NodeId,
    RoleDefinition,
} from "@graph-context-protocol/core";
import { createAgentNode, fail, succeed } from "@graph-context-protocol/core";
import type { ServerError } from "../errors";
import { createServerError } from "../errors";
import type { ExternalAgentId } from "../types";
import type {
    ExternalAgentDescriptor,
    ExternalAgentQuery,
    ExternalAgentRegistry,
    ExternalAgentSnapshot,
    ExternalAgentStatus,
} from "./types";

const EXTERNAL_AGENT_STATUSES: readonly ExternalAgentStatus[] = [
    "registered",
    "connecting",
    "connected",
    "unavailable",
    "disconnected",
    "failed",
];

/**
 * Creates an empty immutable external agent registry.
 *
 * @returns A new external agent registry
 */
export function createExternalAgentRegistry(): ExternalAgentRegistry {
    return createRegistry(new Map());
}

/**
 * Converts an external agent descriptor into a core agent node.
 *
 * @param descriptor - External agent descriptor to convert
 * @param role - Role to assign to the agent node
 * @returns Core agent node representation
 */
export function toAgentNode(
    descriptor: ExternalAgentDescriptor,
    role: RoleDefinition,
): AgentNode {
    return createAgentNode(descriptor.nodeId, role, descriptor.metadata);
}

function createRegistry(
    agents: ReadonlyMap<ExternalAgentId, ExternalAgentDescriptor>,
): ExternalAgentRegistry {
    const agentMap = new Map(agents);

    return {
        register(agent: ExternalAgentDescriptor) {
            if (agentMap.has(agent.id)) {
                return fail(
                    createServerError(
                        "conflict",
                        `External agent already registered: ${agent.id}`,
                        { metadata: { externalAgentId: agent.id } },
                    ),
                );
            }

            const nextAgents = new Map(agentMap);
            nextAgents.set(agent.id, agent);

            return succeed(createRegistry(nextAgents));
        },

        update(id: ExternalAgentId, patch: Partial<ExternalAgentDescriptor>) {
            const current = agentMap.get(id);

            if (!current) {
                return fail(createNotFoundError(id));
            }

            if (patch.id !== undefined && patch.id !== id) {
                return fail(
                    createServerError(
                        "validation-error",
                        "External agent id cannot be changed",
                        {
                            metadata: {
                                externalAgentId: id,
                                patchId: patch.id,
                            },
                        },
                    ),
                );
            }

            const nextAgents = new Map(agentMap);
            nextAgents.set(id, { ...current, ...patch, id });

            return succeed(createRegistry(nextAgents));
        },

        get(id: ExternalAgentId) {
            return agentMap.get(id);
        },

        getByNodeId(nodeId: NodeId) {
            return Array.from(agentMap.values()).find(
                (agent) => agent.nodeId === nodeId,
            );
        },

        list(query?: ExternalAgentQuery) {
            const agentsList = Array.from(agentMap.values());

            if (!query) {
                return agentsList;
            }

            return agentsList.filter((agent) => matchesQuery(agent, query));
        },

        unregister(id: ExternalAgentId) {
            if (!agentMap.has(id)) {
                return fail(createNotFoundError(id));
            }

            const nextAgents = new Map(agentMap);
            nextAgents.delete(id);

            return succeed(createRegistry(nextAgents));
        },

        snapshot() {
            return createSnapshot(agentMap);
        },
    };
}

function matchesQuery(
    agent: ExternalAgentDescriptor,
    query: ExternalAgentQuery,
): boolean {
    if (query.status !== undefined && agent.status !== query.status) {
        return false;
    }

    if (query.roleId !== undefined && agent.role?.id !== query.roleId) {
        return false;
    }

    if (
        query.transportId !== undefined &&
        agent.transportId !== query.transportId
    ) {
        return false;
    }

    if (
        query.capabilities !== undefined &&
        !query.capabilities.every((capabilityId) =>
            agent.capabilities.includes(capabilityId),
        )
    ) {
        return false;
    }

    return true;
}

function createSnapshot(
    agents: ReadonlyMap<ExternalAgentId, ExternalAgentDescriptor>,
): ExternalAgentSnapshot {
    const agentsByStatus = new Map<ExternalAgentStatus, number>();

    for (const status of EXTERNAL_AGENT_STATUSES) {
        agentsByStatus.set(status, 0);
    }

    for (const agent of agents.values()) {
        agentsByStatus.set(
            agent.status,
            (agentsByStatus.get(agent.status) ?? 0) + 1,
        );
    }

    return {
        totalAgents: agents.size,
        agentsByStatus,
    };
}

function createNotFoundError(id: ExternalAgentId): ServerError {
    return createServerError("not-found", `External agent not found: ${id}`, {
        metadata: { externalAgentId: id },
    });
}
