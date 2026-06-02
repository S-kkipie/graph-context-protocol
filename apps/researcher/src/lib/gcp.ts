import path from "node:path";
import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createGraph,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
} from "@graph-context-protocol/core";
import { createMarkdownKnowledgeAdapter } from "@graph-context-protocol/adapters";
import {
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    type GraphContextServer,
} from "@graph-context-protocol/server";

const LOCAL_NODE_ID = "node:researcher";
const KNOWLEDGE_ID = "knowledge:researcher-context";
const CONTEXT_FILE = path.join(process.cwd(), "CONTEXT-1.md");

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started researcher GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        serverPromise = buildServer();
    }
    return serverPromise;
}

async function buildServer(): Promise<GraphContextServer> {
    const role = createRole(
        "role:researcher-context",
        "Researcher Context",
        "Public read-only context for the researcher node",
    );

    const policy = createAccessPolicyDescriptor([], [], true, "empty-result");
    const knowledgeNode = createKnowledgeNode(
        KNOWLEDGE_ID,
        role,
        createMetadataWithAccessPolicy(policy, {
            tags: ["tasks", "notes"],
            contentType: "text/markdown",
        }),
    );

    const graph = createGraph("graph:researcher")
        .addNode(createAgentNode(LOCAL_NODE_ID, role))
        .addNode(knowledgeNode);

    const adapter = createMarkdownKnowledgeAdapter({
        id: KNOWLEDGE_ID,
        filePath: CONTEXT_FILE,
    });
    const registered = createKnowledgeSourceRegistry().register(adapter);
    if (!registered.success) {
        throw new Error(
            `Failed to register knowledge adapter: ${registered.error.message}`,
        );
    }
    const knowledgeSources = registered.data;

    const server = createGraphContextServer(
        {
            id: "server:researcher",
            localNodeId: LOCAL_NODE_ID,
            shutdownTimeoutMs: 30000,
        },
        { graph, knowledgeSources },
    );

    const started = await server.start();
    if (!started.success) {
        throw new Error(`Failed to start GCP server: ${started.error.message}`);
    }
    return server;
}
