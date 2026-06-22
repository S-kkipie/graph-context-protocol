import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import {
    createMcpKnowledgeAdapter,
    type McpClientLike,
} from "./mcp-knowledge-adapter";

const RESOURCE_URI = "doc://incident";

async function connectToMockServer(text: string): Promise<McpClientLike> {
    const server = new McpServer({ name: "mock", version: "0.0.1" });
    server.registerResource("incident", RESOURCE_URI, {}, async (uri) => ({
        contents: [{ uri: uri.href, text }],
    }));
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);
    return client as unknown as McpClientLike;
}

describe("createMcpKnowledgeAdapter", () => {
    it("reads a remote MCP resource and surfaces it as a knowledge node", async () => {
        const adapter = createMcpKnowledgeAdapter({
            id: "knowledge:incident",
            resourceUri: RESOURCE_URI,
            connect: () => connectToMockServer("incident body text"),
        });
        const result = await adapter.query({
            requester: {
                id: "principal:test",
                role: undefined,
                capabilities: [],
                metadata: {},
            },
            query: { kind: "discovery" } as never,
            metadata: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.sourceId).toBe("knowledge:incident");
        expect(result.data.nodes).toHaveLength(1);
        expect(result.data.nodes[0].metadata.content).toContain("incident body text");
    });

    it("fails soft when the MCP connection throws", async () => {
        const adapter = createMcpKnowledgeAdapter({
            id: "knowledge:incident",
            resourceUri: RESOURCE_URI,
            connect: () => {
                throw new Error("connection refused");
            },
        });
        const result = await adapter.query({
            requester: {
                id: "principal:test",
                role: undefined,
                capabilities: [],
                metadata: {},
            },
            query: { kind: "discovery" } as never,
            metadata: {},
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe("unavailable");
    });
});
