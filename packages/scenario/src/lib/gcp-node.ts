import { createMarkdownKnowledgeAdapter } from "@graph-context-protocol/adapters";
import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createGraph,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
} from "@graph-context-protocol/core";
import {
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    type GraphContextServer,
} from "@graph-context-protocol/server";
import { type GcpNodeConfigInput, GcpNodeConfigSchema } from "./config";

/**
 * Builds and starts a single GCP server node from declarative config.
 *
 * Parameterized extraction of the (previously duplicated) researcher/executor
 * `buildServer()` logic. Returns a started server; the caller owns its
 * lifecycle (no module-scoped singleton, so N nodes can run in one process).
 */
export async function createGcpNode(
    config: GcpNodeConfigInput,
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

    const graph = createGraph(cfg.graphId ?? `graph:${cfg.nodeId}`)
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

    const server = createGraphContextServer(
        {
            id: cfg.serverId,
            localNodeId: cfg.nodeId,
            shutdownTimeoutMs: cfg.shutdownTimeoutMs,
        },
        { graph, knowledgeSources: registered.data },
    );

    const started = await server.start();
    if (!started.success) {
        throw new Error(`Failed to start GCP server: ${started.error.message}`);
    }
    return server;
}
