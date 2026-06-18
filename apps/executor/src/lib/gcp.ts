import path from "node:path";
import { createRole } from "@graph-context-protocol/core";
import { createGcpNode } from "@graph-context-protocol/scenario";
import {
    createStaticTokenAuthProvider,
    type GraphContextServer,
    type Principal,
} from "@graph-context-protocol/server";

/** Demo credential the researcher presents when reading executor context. */
const RESEARCHER_TOKEN = "tok:researcher";

/** Principal the executor node recognizes for inbound researcher reads. */
const researcherPrincipal: Principal = {
    id: "principal:researcher",
    role: createRole(
        "role:researcher",
        "Researcher",
        "Researcher node, allowed to read executor context",
    ),
    capabilities: [],
    metadata: {},
};

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started executor GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        const authProvider = createStaticTokenAuthProvider(
            new Map([[RESEARCHER_TOKEN, researcherPrincipal]]),
        );
        serverPromise = createGcpNode(
            {
                serverId: "server:executor",
                nodeId: "node:executor",
                knowledgeId: "knowledge:executor-context",
                graphId: "graph:executor",
                role: {
                    id: "role:executor-context",
                    name: "Executor Context",
                    description: "Role-gated context for the executor node",
                },
                accessPolicy: {
                    readableByRoles: ["role:researcher"],
                    requiredCapabilities: [],
                    fallbackAllowed: false,
                    denialMode: "error",
                },
                knowledge: {
                    filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                    tags: ["results", "log"],
                    contentType: "text/markdown",
                },
            },
            { authProvider },
        );
    }
    return serverPromise;
}
