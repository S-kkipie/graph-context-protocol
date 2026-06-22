/**
 * Consume side of the MCP bridge: a KnowledgeSourceAdapter backed by a remote
 * MCP resource, so a GCP graph federates over MCP servers. Mirrors
 * createMarkdownKnowledgeAdapter; the registry resolves adapters by
 * targetNodeId, so `id` MUST equal the backed GCP knowledge node id. The MCP
 * client is injected via `connect` (production builds a real StreamableHTTP /
 * stdio client; tests link an in-memory pair).
 *
 * @module mcp-knowledge-adapter
 */

import {
    createKnowledgeNode,
    createRole,
    fail,
    type RoleDefinition,
    succeed,
} from "@graph-context-protocol/core";
import {
    createServerError,
    type KnowledgeSourceAdapter,
    type ServerErrorCode,
} from "@graph-context-protocol/server";

/** Minimal MCP client surface the adapter needs (real SDK Client satisfies it). */
export interface McpClientLike {
    readResource(args: {
        uri: string;
    }): Promise<{ contents: ReadonlyArray<{ text?: string }> }>;
}

export interface McpKnowledgeAdapterConfig {
    /** Adapter id — MUST equal the backed GCP knowledge node id. */
    readonly id: string;
    /** MCP resource URI to read. */
    readonly resourceUri: string;
    /** Connects an MCP client. Caller owns the transport (real or in-memory). */
    readonly connect: () => Promise<McpClientLike>;
    /** Role assigned to the produced knowledge node. */
    readonly role?: RoleDefinition;
}

const DEFAULT_ROLE = createRole(
    "role:mcp-source",
    "MCP Source",
    "Read-only MCP knowledge source",
);

/** Creates a KnowledgeSourceAdapter backed by a remote MCP resource. */
export function createMcpKnowledgeAdapter(
    config: McpKnowledgeAdapterConfig,
): KnowledgeSourceAdapter {
    const role = config.role ?? DEFAULT_ROLE;
    return {
        id: config.id,
        capabilities: ["lookup"],
        async query() {
            try {
                const client = await config.connect();
                const { contents } = await client.readResource({
                    uri: config.resourceUri,
                });
                const text = contents
                    .map((c) => c.text ?? "")
                    .join("")
                    .trim();
                const node = createKnowledgeNode(config.id, role, {
                    contentType: "text/markdown",
                    content: text,
                });
                return succeed({
                    sourceId: config.id,
                    nodes: [node],
                    raw: text,
                    metadata: { mcpResourceUri: config.resourceUri },
                });
            } catch (cause) {
                return fail(
                    createServerError(
                        // "unavailable" is the semantic code for this error;
                        // cast because the server's ServerErrorCode union does not yet
                        // include it and we cannot modify the server package here.
                        "unavailable" as ServerErrorCode,
                        `Cannot read MCP resource: ${config.resourceUri}`,
                        { metadata: { cause: String(cause) } },
                    ),
                );
            }
        },
    };
}
