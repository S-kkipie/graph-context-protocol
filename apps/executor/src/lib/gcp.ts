import path from "node:path";
import { createGcpNode } from "@graph-context-protocol/scenario";
import type { GraphContextServer } from "@graph-context-protocol/server";

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started executor GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        serverPromise = createGcpNode({
            serverId: "server:executor",
            nodeId: "node:executor",
            knowledgeId: "knowledge:executor-context",
            graphId: "graph:executor",
            role: {
                id: "role:executor-context",
                name: "Executor Context",
                description: "Public read-only context for the executor node",
            },
            accessPolicy: {
                readableByRoles: [],
                requiredCapabilities: [],
                fallbackAllowed: true,
                denialMode: "empty-result",
            },
            knowledge: {
                filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                tags: ["results", "log"],
                contentType: "text/markdown",
            },
        });
    }
    return serverPromise;
}
