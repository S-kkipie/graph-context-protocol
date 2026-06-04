import path from "node:path";
import { createGcpNode } from "@graph-context-protocol/scenario";
import type { GraphContextServer } from "@graph-context-protocol/server";

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started researcher GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        serverPromise = createGcpNode({
            serverId: "server:researcher",
            nodeId: "node:researcher",
            knowledgeId: "knowledge:researcher-context",
            graphId: "graph:researcher",
            role: {
                id: "role:researcher-context",
                name: "Researcher Context",
                description: "Public read-only context for the researcher node",
            },
            accessPolicy: {
                readableByRoles: [],
                requiredCapabilities: [],
                fallbackAllowed: true,
                denialMode: "empty-result",
            },
            knowledge: {
                filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                tags: ["tasks", "notes"],
                contentType: "text/markdown",
            },
        });
    }
    return serverPromise;
}
