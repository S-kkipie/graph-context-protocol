import {
    createAgentNode,
    createCapability,
    createContextRule,
    createEdge,
    createGraph,
    createKnowledgeNode,
    createRole,
    SystemCapabilities,
    type Graph,
} from "@graph-context-protocol/core";
import type { DescriptorDto, GraphSnapshotDto } from "./descriptor";

/**
 * Creates an in-memory GCP graph for this node with an agent,
 * knowledge node, and a local traversal edge.
 *
 * @param nodeId - Unique identifier for this node
 * @returns A new Graph instance
 */
export function createLocalGraph(nodeId: string): Graph {
    const role = createRole(
        `role:${nodeId}`,
        `${nodeId} Agent`,
        `Local agent role for ${nodeId}`,
        [
            createCapability(
                SystemCapabilities.DISCOVER_AGENTS,
                "Discover Agents",
                "",
            ),
            createCapability(
                SystemCapabilities.DISCOVER_KNOWLEDGE,
                "Discover Knowledge",
                "",
            ),
        ],
        [
            createContextRule("graph.nodes.agent", "read"),
            createContextRule("graph.nodes.knowledge", "read"),
        ],
    );

    return createGraph(`graph:${nodeId}`)
        .addNode(createAgentNode(`agent:${nodeId}`, role, { nodeId }))
        .addNode(
            createKnowledgeNode(`knowledge:${nodeId}-specs`, role, {
                nodeId,
                tags: ["specs"],
                contentType: "application/json",
            }),
        )
        .addEdge(
            createEdge(
                `edge:${nodeId}-agent-to-specs`,
                `agent:${nodeId}`,
                `knowledge:${nodeId}-specs`,
                "can-traverse",
            ),
        );
}

/**
 * Builds a serializable descriptor DTO from the graph.
 *
 * @param nodeId - Node identifier
 * @param name - Human-readable name
 * @param graph - The local graph
 * @param peerUrl - Optional peer URL
 * @returns Descriptor DTO
 */
export function buildDescriptor(
    nodeId: string,
    name: string,
    graph: Graph,
    peerUrl?: string,
): DescriptorDto {
    const agentNodeId = `agent:${nodeId}`;
    const knowledgeNodeIds: string[] = [];
    for (const node of graph.nodes.values()) {
        if (node.kind === "knowledge") {
            knowledgeNodeIds.push(node.id);
        }
    }

    return {
        nodeId,
        name,
        agentNodeId,
        knowledgeNodeIds,
        endpoints: [
            "/health",
            "/gcp/descriptor",
            "/gcp/graph",
            "/gcp/discover",
            "/gcp/discovery",
            "/gcp/agents",
            "/gcp/knowledge",
        ],
        peerUrl,
    };
}

/**
 * Builds a serializable graph snapshot DTO.
 *
 * @param graph - The graph to snapshot
 * @returns Graph snapshot DTO
 */
export function buildGraphSnapshot(graph: Graph): GraphSnapshotDto {
    const nodes: GraphSnapshotDto["nodes"] = [];
    for (const node of graph.nodes.values()) {
        nodes.push({
            id: node.id,
            kind: node.kind,
            roleId: node.role.id,
            metadata: node.metadata,
            createdAt: node.createdAt,
        });
    }

    const edges: GraphSnapshotDto["edges"] = [];
    for (const edge of graph.edges.values()) {
        edges.push(edge.toJSON());
    }

    return { id: graph.id, nodes, edges };
}
