import path from "node:path";
import { createRole } from "@graph-context-protocol/core";
import { createGcpNode } from "@graph-context-protocol/scenario";
import {
    createStaticTokenAuthProvider,
    type GraphContextServer,
    type Principal,
} from "@graph-context-protocol/server";
import { env } from "@/env";

/** Demo credential the executor presents when reading researcher context. */
const EXECUTOR_TOKEN = "tok:executor";

/** Principal the researcher node recognizes for inbound executor reads. */
const executorPrincipal: Principal = {
    id: "principal:executor",
    role: createRole(
        "role:executor",
        "Executor",
        "Executor node, allowed to read researcher context",
    ),
    capabilities: [],
    metadata: {},
};

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started researcher GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        const authProvider = createStaticTokenAuthProvider(
            new Map([[EXECUTOR_TOKEN, executorPrincipal]]),
        );
        serverPromise = createGcpNode(
            {
                serverId: "server:researcher",
                nodeId: "node:researcher",
                knowledgeId: "knowledge:researcher-context",
                graphId: "graph:researcher",
                role: {
                    id: "role:researcher-context",
                    name: "Researcher Context",
                    description: "Role-gated context for the researcher node",
                },
                accessPolicy: {
                    readableByRoles: ["role:executor"],
                    requiredCapabilities: [],
                    fallbackAllowed: false,
                    denialMode: "error",
                },
                knowledge: {
                    filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                    tags: ["tasks", "notes"],
                    contentType: "text/markdown",
                },
                peers: [
                    {
                        peerId: "peer:executor",
                        endpoint: env.PEER_GCP_URL,
                        knowledgeNodeId: "knowledge:executor-context",
                        tags: ["results", "log"],
                    },
                ],
            },
            { authProvider },
        );
    }
    return serverPromise;
}
