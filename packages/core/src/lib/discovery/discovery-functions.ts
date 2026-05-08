import { isAgentNode, isKnowledgeNode } from "../graph/graph-type-guards";
import type {
    AgentNode,
    Graph,
    GraphEdge,
    GraphNode,
    KnowledgeNode,
    NodeKind,
} from "../graph/graph-types";
import { SystemCapabilities } from "../role/role-types";
import type { CapabilityId, NodeId } from "../types";
import {
    type DiscoveredNode,
    DiscoveryError,
    type DiscoveryFilters,
    type DiscoveryQuery,
    type DiscoveryResult,
} from "./discovery-types";

/**
 * Normalizes discovery query with defaults.
 */
function normalizeQuery(query?: DiscoveryQuery): Required<DiscoveryQuery> {
    return {
        kinds: query?.kinds ?? ["agent", "knowledge"],
        maxDepth: query?.maxDepth ?? 10,
        edgeTypes: query?.edgeTypes ?? [
            "can-traverse",
            "can-access",
            "depends-on",
        ],
        filters: query?.filters ?? {},
    };
}

/**
 * Checks if requester has discovery capability for a node kind.
 */
function hasDiscoveryCapability(requester: AgentNode, kind: NodeKind): boolean {
    switch (kind) {
        case "agent":
            return requester.role.hasCapability(
                SystemCapabilities.DISCOVER_AGENTS,
            );
        case "knowledge":
            return requester.role.hasCapability(
                SystemCapabilities.DISCOVER_KNOWLEDGE,
            );
        default:
            return false;
    }
}

/**
 * Checks if requester can read discovery path based on context rules.
 */
function canReadDiscoveryPath(requester: AgentNode, path: string): boolean {
    const rules = requester.role.getEffectiveContextRules();

    for (const rule of rules) {
        if (matchesPath(rule.path, path)) {
            return rule.access !== "none";
        }
    }

    return false;
}

/**
 * Matches a path against a pattern (supports * wildcard).
 */
function matchesPath(pattern: string, path: string): boolean {
    if (pattern === path) return true;
    if (pattern.endsWith(".*")) {
        const prefix = pattern.slice(0, -2);
        return path.startsWith(`${prefix}.`) || path === prefix;
    }
    return false;
}

/**
 * Checks if requester can discover a specific node.
 */
function canDiscoverNode(requester: AgentNode, node: GraphNode): boolean {
    const hasCapability = hasDiscoveryCapability(requester, node.kind);
    const hasPathAccess = canReadDiscoveryPath(
        requester,
        `graph.nodes.${node.kind}`,
    );
    return hasCapability && hasPathAccess;
}

/**
 * Checks if a node matches discovery filters.
 */
function matchesFilters(node: GraphNode, filters: DiscoveryFilters): boolean {
    if (filters.nodeIds && !filters.nodeIds.includes(node.id)) {
        return false;
    }

    if (filters.roleIds && !filters.roleIds.includes(node.role.id)) {
        return false;
    }

    if (filters.metadata) {
        for (const [key, value] of Object.entries(filters.metadata)) {
            if (node.metadata[key] !== value) {
                return false;
            }
        }
    }

    if (isAgentNode(node) && filters.capabilities) {
        for (const cap of filters.capabilities) {
            if (!node.role.hasCapability(cap as CapabilityId)) {
                return false;
            }
        }
    }

    if (isKnowledgeNode(node)) {
        const tags = (node.metadata.tags as string[]) ?? [];

        if (filters.tags && filters.tags.length > 0) {
            const mode = filters.tagMode ?? "any";
            if (mode === "all") {
                for (const tag of filters.tags) {
                    if (!tags.includes(tag)) return false;
                }
            } else {
                let hasMatch = false;
                for (const tag of filters.tags) {
                    if (tags.includes(tag)) {
                        hasMatch = true;
                        break;
                    }
                }
                if (!hasMatch) return false;
            }
        }

        if (filters.contentTypes && filters.contentTypes.length > 0) {
            const contentType = node.metadata.contentType as string;
            if (!contentType || !filters.contentTypes.includes(contentType)) {
                return false;
            }
        }

        if (filters.sources && filters.sources.length > 0) {
            const source = node.metadata.source as string;
            if (!source || !filters.sources.includes(source)) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Gets next traversal steps from current node.
 */
function getNextSteps(
    graph: Graph,
    currentId: NodeId,
    edgeTypes: readonly string[],
): Array<{ id: NodeId; edge: GraphEdge }> {
    const results: Array<{ id: NodeId; edge: GraphEdge }> = [];

    for (const edge of graph.edges.values()) {
        if (!edgeTypes.includes(edge.type)) continue;

        if (edge.source === currentId) {
            results.push({ id: edge.target, edge });
        } else if (edge.bidirectional && edge.target === currentId) {
            results.push({ id: edge.source, edge });
        }
    }

    return results;
}

/**
 * Discovers nodes in the graph starting from requester.
 */
export function discoverNodes(
    graph: Graph,
    requesterId: NodeId,
    query?: DiscoveryQuery,
): DiscoveryResult<GraphNode> {
    const requester = graph.nodes.get(requesterId);
    if (!requester) {
        throw new DiscoveryError("Requester node not found");
    }
    if (!isAgentNode(requester)) {
        throw new DiscoveryError("Requester must be an agent node");
    }

    const normalized = normalizeQuery(query);
    const visited = new Set<NodeId>([requesterId]);
    const queue: Array<{ id: NodeId; path: NodeId[]; distance: number }> = [
        { id: requesterId, path: [requesterId], distance: 0 },
    ];
    const nodes: DiscoveredNode<GraphNode>[] = [];
    const denied = new Set<NodeId>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) continue;

        if (current.distance >= normalized.maxDepth) continue;

        for (const next of getNextSteps(
            graph,
            current.id,
            normalized.edgeTypes,
        )) {
            if (visited.has(next.id)) continue;

            visited.add(next.id);

            const candidate = graph.nodes.get(next.id);
            if (!candidate) continue;

            const path = [...current.path, candidate.id];
            const distance = current.distance + 1;

            queue.push({ id: candidate.id, path, distance });

            if (!normalized.kinds.includes(candidate.kind)) continue;
            if (!matchesFilters(candidate, normalized.filters)) continue;

            if (!canDiscoverNode(requester, candidate)) {
                denied.add(candidate.id);
                continue;
            }

            nodes.push({ node: candidate, path, distance });
        }
    }

    return {
        requester,
        nodes,
        denied: Array.from(denied),
    };
}

/**
 * Discovers agent nodes reachable from requester.
 */
export function discoverAgents(
    graph: Graph,
    requesterId: NodeId,
    filters?: DiscoveryFilters,
): DiscoveryResult<AgentNode> {
    const result = discoverNodes(graph, requesterId, {
        kinds: ["agent"],
        filters,
    });

    return {
        requester: result.requester,
        nodes: result.nodes
            .filter((n): n is DiscoveredNode<AgentNode> => isAgentNode(n.node))
            .map((n) => ({
                node: n.node as AgentNode,
                path: n.path,
                distance: n.distance,
            })),
        denied: result.denied,
    };
}

/**
 * Discovers knowledge nodes reachable from requester.
 */
export function discoverKnowledge(
    graph: Graph,
    requesterId: NodeId,
    filters?: DiscoveryFilters,
): DiscoveryResult<KnowledgeNode> {
    const result = discoverNodes(graph, requesterId, {
        kinds: ["knowledge"],
        filters,
    });

    return {
        requester: result.requester,
        nodes: result.nodes
            .filter((n): n is DiscoveredNode<KnowledgeNode> =>
                isKnowledgeNode(n.node),
            )
            .map((n) => ({
                node: n.node as KnowledgeNode,
                path: n.path,
                distance: n.distance,
            })),
        denied: result.denied,
    };
}
