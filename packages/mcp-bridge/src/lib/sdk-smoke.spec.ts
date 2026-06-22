import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

describe("MCP SDK subpaths resolve", () => {
    it("exposes McpServer, Client, and InMemoryTransport.createLinkedPair", () => {
        expect(McpServer).toBeTypeOf("function");
        expect(Client).toBeTypeOf("function");
        expect(InMemoryTransport.createLinkedPair).toBeTypeOf("function");
    });
});
