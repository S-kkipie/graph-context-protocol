import {
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createAccessPolicyDescriptor,
    createAgentNode,
    createGraph,
    createRole,
    fail,
    succeed,
} from "@graph-context-protocol/core";
import {
    type AuthProvider,
    type Credentials,
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    createServerError,
    type KnowledgeSourceAdapter,
    type Principal,
} from "@graph-context-protocol/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createGcpMcpServer, createRawMcpServer } from "./gcp-mcp-server";

const CANARY = "MCP-EXPOSE-CANARY-1";
const KNOWLEDGE_ID = "knowledge:secret";
const TOKEN = "tok:agent";

/** A token auth provider that authenticates to a fixed principal and authorizes all. */
function fixedPrincipalProvider(principal: Principal): AuthProvider {
    return {
        async authenticate(creds: Credentials) {
            return creds.value === TOKEN
                ? succeed(principal)
                : fail(createServerError("auth-error", "bad token"));
        },
        authorize() {
            return succeed({ allowed: true, matchedRoles: [], matchedCapabilities: [] });
        },
    } as unknown as AuthProvider;
}

async function startGcpServer(readableByRoles: string[]) {
    const nodeRole = createRole("role:node", "Node", "");
    const policy = createAccessPolicyDescriptor(
        readableByRoles,
        [],
        false,
        "error",
    );
    const knowledgeNode = createKnowledgeNode(
        KNOWLEDGE_ID,
        nodeRole,
        createMetadataWithAccessPolicy(policy, {
            tags: ["secret"],
            contentType: "text/markdown",
        }),
    );
    const graph = createGraph("graph:test")
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
                        content: `secret body ${CANARY}`,
                    }),
                ],
                metadata: {},
            });
        },
    };
    const registry = createKnowledgeSourceRegistry().register(adapter);
    if (!registry.success) throw new Error("adapter registration failed");
    // The agent principal's role is role:auditor; whether it can read is
    // controlled solely by readableByRoles passed in by the caller.
    const principal: Principal = {
        id: "principal:agent",
        role: createRole("role:auditor", "Auditor", ""),
        capabilities: [],
        metadata: {},
    };
    const server = createGraphContextServer(
        { id: "server:test", localNodeId: "node:agent", shutdownTimeoutMs: 5000 },
        {
            graph,
            knowledgeSources: registry.data,
            auth: fixedPrincipalProvider(principal),
        },
    );
    const started = await server.start();
    if (!started.success) throw new Error("server start failed");
    return server;
}

async function linkClient(mcpServer: ReturnType<typeof createRawMcpServer>) {
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);
    const client = new Client({ name: "test", version: "0.0.1" });
    await client.connect(clientTransport);
    return client;
}

describe("createGcpMcpServer (expose, gated)", () => {
    it("denies an under-privileged read — no content crosses the bridge", async () => {
        // auditor role is NOT in readableByRoles -> gate denies.
        const server = await startGcpServer(["role:owner"]);
        const expose = createGcpMcpServer({
            server,
            resources: [{ nodeId: KNOWLEDGE_ID, uri: "gcp://secret", name: "secret" }],
            credentials: { type: "token", value: TOKEN },
        });
        const client = await linkClient(expose);
        const res = await client.readResource({ uri: "gcp://secret" });
        const text = res.contents.map((c) => ("text" in c ? c.text : "")).join("");
        expect(text).not.toContain(CANARY);
        expect(res.contents.length).toBe(0);
    });

    it("returns content when the role is permitted", async () => {
        const server = await startGcpServer(["role:auditor"]);
        const expose = createGcpMcpServer({
            server,
            resources: [{ nodeId: KNOWLEDGE_ID, uri: "gcp://secret", name: "secret" }],
            credentials: { type: "token", value: TOKEN },
        });
        const client = await linkClient(expose);
        const res = await client.readResource({ uri: "gcp://secret" });
        const text = res.contents.map((c) => ("text" in c ? c.text : "")).join("");
        expect(text).toContain(CANARY);
    });
});

describe("createRawMcpServer (ungated)", () => {
    it("returns the configured text with no policy", async () => {
        const raw = createRawMcpServer({
            resources: [{ uri: "raw://secret", name: "secret", text: `leak ${CANARY}` }],
        });
        const client = await linkClient(raw);
        const res = await client.readResource({ uri: "raw://secret" });
        const text = res.contents.map((c) => ("text" in c ? c.text : "")).join("");
        expect(text).toContain(CANARY);
    });
});
