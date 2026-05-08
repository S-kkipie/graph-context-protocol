import type { Graph } from "@graph-context-protocol/core";
import {
    createAgentNode,
    createCapability,
    createEdge,
    createGraph,
    createKnowledgeNode,
    createRole,
    SystemCapabilities,
} from "@graph-context-protocol/core";

export function createDemoGraph(): Graph {
    const role = createRole(
        "role:server",
        "Server Agent",
        "Agent that runs the demo server",
        [createCapability(SystemCapabilities.READ_CONTEXT, "Read Context", "")],
        [{ path: "public.*", access: "read" }],
    );

    return createGraph("graph:demo")
        .addNode(createAgentNode("agent:server", role))
        .addNode(
            createKnowledgeNode("knowledge:docs", role, {
                tags: ["docs"],
                contentType: "text/markdown",
            }),
        )
        .addEdge(
            createEdge(
                "edge:1",
                "agent:server",
                "knowledge:docs",
                "can-access",
            ),
        );
}
