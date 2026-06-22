import {
    type AccessPolicyDescriptor,
    createAgentNode,
    createGraph,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
    succeed,
} from "@graph-context-protocol/core";
import {
    authorizeKnowledgeNodeAccess,
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    createStaticTokenAuthProvider,
    type KnowledgeSourceAdapter,
    type Principal,
} from "@graph-context-protocol/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createGcpMcpServer } from "../gcp-mcp-server";
import { accessPolicyArb, MCP_RUN_OPTS, principalArb } from "./arbitraries";

const CANARY = "P5-MCP-CANARY";
const KNOWLEDGE_ID = "knowledge:p5";
const TOKEN = "tok:p5";

async function mcpReadHasContent(
    policy: AccessPolicyDescriptor,
    principal: Principal,
): Promise<{ mcpContent: boolean; gateAllows: boolean; leaked: boolean }> {
    const nodeRole = createRole("role:node", "Node", "");
    const knowledgeNode = createKnowledgeNode(
        KNOWLEDGE_ID,
        nodeRole,
        createMetadataWithAccessPolicy(policy, {
            tags: ["p5"],
            contentType: "text/markdown",
        }),
    );
    const graph = createGraph("graph:p5")
        .addNode(createAgentNode("node:agent", nodeRole))
        .addNode(knowledgeNode);
    const adapter: KnowledgeSourceAdapter = {
        id: KNOWLEDGE_ID,
        capabilities: ["lookup"],
        async query() {
            return succeed({
                sourceId: KNOWLEDGE_ID,
                nodes: [
                    createKnowledgeNode(KNOWLEDGE_ID, nodeRole, {
                        contentType: "text/markdown",
                        content: `body ${CANARY}`,
                    }),
                ],
                metadata: {},
            });
        },
    };
    const registry = createKnowledgeSourceRegistry().register(adapter);
    if (!registry.success) throw new Error("adapter registration failed");
    const provider = createStaticTokenAuthProvider(
        new Map([[TOKEN, principal]]),
    );
    const server = createGraphContextServer(
        { id: "server:p5", localNodeId: "node:agent", shutdownTimeoutMs: 5000 },
        { graph, knowledgeSources: registry.data, auth: provider },
    );
    const started = await server.start();
    if (!started.success) throw new Error("server start failed");

    // The real gate is the reference oracle, called with the same node+provider.
    const gate = authorizeKnowledgeNodeAccess(
        principal,
        knowledgeNode,
        provider,
        { action: "query-knowledge" },
    );

    const expose = createGcpMcpServer({
        server,
        resources: [{ nodeId: KNOWLEDGE_ID, uri: "gcp://p5", name: "p5" }],
        credentials: { type: "token", value: TOKEN },
    });
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    await expose.connect(serverTransport);
    const client = new Client({ name: "p5", version: "0.0.1" });
    await client.connect(clientTransport);
    const res = await client.readResource({ uri: "gcp://p5" });
    const text = res.contents
        .map((c) => ("text" in c ? (c.text ?? "") : ""))
        .join("");
    await client.close();
    await expose.close();
    return {
        mcpContent: res.contents.length > 0 && text.length > 0,
        gateAllows: gate.success,
        leaked: text.includes(CANARY),
    };
}

describe("P5: MCP expose denies exactly when the read gate denies", () => {
    it("MCP read returns content iff authorizeKnowledgeNodeAccess succeeds; no canary leaks on denial", async () => {
        await fc.assert(
            fc.asyncProperty(
                accessPolicyArb,
                principalArb,
                async (policy, principal) => {
                    const { mcpContent, gateAllows, leaked } =
                        await mcpReadHasContent(policy, principal);
                    // soundness: bridge content presence === gate decision
                    expect(mcpContent).toBe(gateAllows);
                    // no-leak: when the gate denies, the canary never crosses
                    if (!gateAllows) expect(leaked).toBe(false);
                },
            ),
            MCP_RUN_OPTS,
        );
    });
});
