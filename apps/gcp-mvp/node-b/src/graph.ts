import {
    createAgentNode,
    createCapability,
    createContextRule,
    createEdge,
    createGraph,
    createKnowledgeNode,
    createAccessPolicyDescriptor,
    createMetadataWithAccessPolicy,
    createRole,
    type Graph,
    SystemCapabilities,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
    type ContextPeerDescriptor,
} from "@graph-context-protocol/core";
import type { DescriptorDto, GraphSnapshotDto } from "./descriptor";

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
            createCapability(
                SystemCapabilities.QUERY_REMOTE_CONTEXT,
                "Query Remote Context",
                "",
            ),
            createCapability(
                SystemCapabilities.DISCOVER_PEERS,
                "Discover Peers",
                "",
            ),
        ],
        [
            createContextRule("graph.nodes.agent", "read"),
            createContextRule("graph.nodes.knowledge", "read"),
        ],
    );

    const eventsPolicy = createAccessPolicyDescriptor(
        ["role:ceo", "role:developer"],
        [SystemCapabilities.QUERY_REMOTE_CONTEXT],
        false,
        "error",
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
        .addNode(
            createKnowledgeNode(
                `knowledge:${nodeId}-events`,
                role,
                createMetadataWithAccessPolicy(eventsPolicy, {
                    nodeId,
                    tags: ["events", "today"],
                    contentType: "application/json",
                    knowledgeType: "events",
                    queryable: true,
                }),
            ),
        )
        .addEdge(
            createEdge(
                `edge:${nodeId}-agent-to-specs`,
                `agent:${nodeId}`,
                `knowledge:${nodeId}-specs`,
                "can-traverse",
            ),
        )
        .addEdge(
            createEdge(
                `edge:${nodeId}-agent-to-events`,
                `agent:${nodeId}`,
                `knowledge:${nodeId}-events`,
                "can-traverse",
            ),
        );
}

export function buildContextPeerDescriptor(
    nodeId: string,
    name: string,
    graph: Graph,
    endpoint: string,
): ContextPeerDescriptor {
    const auth = createAuthContract(
        ["bearer-token"],
        true,
        ["role:ceo", "role:developer"],
        [SystemCapabilities.QUERY_REMOTE_CONTEXT],
    );
    const queryContract = createKnowledgeQueryContract(
        ["text", "structured"],
        true,
        ["since", "tag"],
        { maxQueryLength: 500, timeoutMs: 5_000 },
    );
    const policy = createAccessPolicyDescriptor(
        ["role:ceo", "role:developer"],
        [SystemCapabilities.QUERY_REMOTE_CONTEXT],
        false,
        "error",
    );
    const eventsNode = graph.nodes.get(`knowledge:${nodeId}-events`);
    const exposedKnowledge =
        eventsNode?.kind === "knowledge"
            ? [
                  createExposedKnowledgeDescriptor(
                      eventsNode.id,
                      "events",
                      true,
                      queryContract,
                      policy,
                      ["events", "today"],
                      ["application/json"],
                      eventsNode.metadata,
                  ),
              ]
            : [];

    return createContextPeerDescriptor(
        `descriptor:${nodeId}`,
        `peer:${nodeId}`,
        endpoint,
        auth,
        exposedKnowledge,
        [
            SystemCapabilities.QUERY_REMOTE_CONTEXT,
            SystemCapabilities.DISCOVER_PEERS,
        ],
        {
            graphId: graph.id,
            displayName: name,
            queryEndpoint: "/gcp/context/query",
        },
    );
}

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
            "/gcp/context/descriptor",
            "/gcp/context/query",
            "/gcp/context/query-peer",
        ],
        peerUrl,
    };
}

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
