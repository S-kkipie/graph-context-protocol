import { createMarkdownKnowledgeAdapter } from "@graph-context-protocol/adapters";
import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createGraph,
    createKnowledgeNode,
    createKnowledgeQueryContract,
    createMetadataWithAccessPolicy,
    createRole,
} from "@graph-context-protocol/core";
import {
    type AuditSink,
    type AuthProvider,
    createCouplingMetrics,
    createGraphContextServer,
    createHttpTransport,
    createKnowledgeSourceRegistry,
    createPeerRegistry,
    createTransportRegistry,
    type GraphContextServer,
    type ServerDependencies,
} from "@graph-context-protocol/server";
import { type GcpNodeConfigInput, GcpNodeConfigSchema } from "./config";

/**
 * Resolves a node's graph id: the explicit `graphId` when given, otherwise
 * `graph:<suffix>` where `<suffix>` is the node id with any leading `node:`
 * stripped (so `node:researcher` → `graph:researcher`, not
 * `graph:node:researcher`).
 */
export function resolveGraphId(nodeId: string, graphId?: string): string {
    return graphId ?? `graph:${nodeId.replace(/^node:/, "")}`;
}

/** Optional runtime dependencies for a GCP node. */
export interface GcpNodeDependencies {
    /**
     * Auth provider for the node. When omitted, the server's allow-all
     * provider is used (suitable for an ungated demo).
     */
    readonly authProvider?: AuthProvider;
    /**
     * Audit sink for read-provenance. When omitted, the server's default
     * in-memory sink is used.
     */
    readonly auditSink?: AuditSink;
}

/**
 * Builds and starts a single GCP server node from declarative config.
 *
 * Parameterized extraction of the (previously duplicated) researcher/executor
 * `buildServer()` logic. Returns a started server; the caller owns its
 * lifecycle (no module-scoped singleton, so N nodes can run in one process).
 */
export async function createGcpNode(
    config: GcpNodeConfigInput,
    deps: GcpNodeDependencies = {},
): Promise<GraphContextServer> {
    const cfg = GcpNodeConfigSchema.parse(config);

    const role = createRole(cfg.role.id, cfg.role.name, cfg.role.description);

    const policy = createAccessPolicyDescriptor(
        cfg.accessPolicy.readableByRoles,
        cfg.accessPolicy.requiredCapabilities,
        cfg.accessPolicy.fallbackAllowed,
        cfg.accessPolicy.denialMode,
    );

    const knowledgeNode = createKnowledgeNode(
        cfg.knowledgeId,
        role,
        createMetadataWithAccessPolicy(policy, {
            tags: cfg.knowledge.tags,
            contentType: cfg.knowledge.contentType,
        }),
    );

    const graph = createGraph(resolveGraphId(cfg.nodeId, cfg.graphId))
        .addNode(createAgentNode(cfg.nodeId, role))
        .addNode(knowledgeNode);

    const adapter = createMarkdownKnowledgeAdapter({
        id: cfg.knowledgeId,
        filePath: cfg.knowledge.filePath,
    });
    const registered = createKnowledgeSourceRegistry().register(adapter);
    if (!registered.success) {
        throw new Error(
            `Failed to register knowledge adapter: ${registered.error.message}`,
        );
    }

    const peerDescriptors = cfg.peers.map((peerRef) =>
        createContextPeerDescriptor(
            `peer-desc:${peerRef.peerId}`,
            peerRef.peerId,
            peerRef.endpoint,
            createAuthContract(["bearer-token"], false),
            [
                createExposedKnowledgeDescriptor(
                    peerRef.knowledgeNodeId,
                    "text",
                    true,
                    createKnowledgeQueryContract(["text"], false),
                    createAccessPolicyDescriptor([], [], true, "empty-result"),
                    peerRef.tags,
                ),
            ],
            [],
        ),
    );
    const peers = createPeerRegistry(peerDescriptors);
    const metrics = createCouplingMetrics();
    const httpTransport = createHttpTransport({
        resolveEndpoint: (envelope) =>
            envelope.metadata["gcp.peerEndpoint"] as string | undefined,
    });
    const transportResult = createTransportRegistry().register(httpTransport);
    if (!transportResult.success) {
        throw new Error(
            `Failed to register HTTP transport: ${transportResult.error.message}`,
        );
    }
    const transports = transportResult.data;

    const baseDeps: Pick<ServerDependencies, "graph" | "knowledgeSources"> = {
        graph,
        knowledgeSources: registered.data,
    };
    const dependencies: Partial<ServerDependencies> = {
        ...baseDeps,
        peers,
        transports,
        metrics,
        ...(deps.authProvider !== undefined ? { auth: deps.authProvider } : {}),
        ...(deps.auditSink !== undefined ? { audit: deps.auditSink } : {}),
    };

    const server = createGraphContextServer(
        {
            id: cfg.serverId,
            localNodeId: cfg.nodeId,
            shutdownTimeoutMs: cfg.shutdownTimeoutMs,
        },
        dependencies,
    );

    const started = await server.start();
    if (!started.success) {
        throw new Error(`Failed to start GCP server: ${started.error.message}`);
    }
    return server;
}
