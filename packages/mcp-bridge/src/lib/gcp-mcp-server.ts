/**
 * Expose side of the MCP bridge. createGcpMcpServer wraps a started
 * GraphContextServer: each MCP resource read is translated into a GCP
 * context-query and dispatched through `server.receive` (via createFetchHandler
 * + an in-process fetchImpl + queryRemoteContext), so the SAME proven read gate
 * (authorizeKnowledgeNodeAccess, M6) enforces — no re-implemented auth. On
 * denial the resource returns { contents: [] }: no node content crosses the
 * bridge. createRawMcpServer is the ungated control used by the eval raw-mcp
 * arm. Both return UNCONNECTED McpServers; the caller connects a transport.
 *
 * @module gcp-mcp-server
 */

import {
    createContextQuery,
    createRequesterDescriptor,
    type NodeId,
} from "@graph-context-protocol/core";
import {
    type Credentials,
    createFetchHandler,
    type GraphContextServer,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface GcpMcpResource {
    /** GCP knowledge node id (the context-query target). */
    readonly nodeId: NodeId;
    /** MCP resource URI clients read. */
    readonly uri: string;
    /** MCP resource display name. */
    readonly name: string;
}

export interface GcpMcpServerConfig {
    /** A STARTED GraphContextServer whose nodes are exposed. */
    readonly server: GraphContextServer;
    readonly resources: ReadonlyArray<GcpMcpResource>;
    /** The authenticated MCP session's GCP credentials (identity for the gate). */
    readonly credentials: Credentials;
    readonly info?: { name?: string; version?: string };
}

const EXPOSE_URL = "http://gcp-mcp-expose";

/**
 * Extracts a text string from a context-query result value, handling the three
 * shapes produced by executeTargetedContextQuery:
 *   1. string  — adapter set KnowledgeQueryResult.raw to a string (markdown-backed).
 *   2. array   — adapter returned KnowledgeNode[]; join metadata.content fields.
 *   3. other   — JSON.stringify fallback.
 */
function extractResultText(result: unknown): string {
    if (typeof result === "string") {
        return result;
    }
    if (Array.isArray(result)) {
        return result
            .map((n: unknown) => {
                if (
                    n !== null &&
                    typeof n === "object" &&
                    "metadata" in n &&
                    n.metadata !== null &&
                    typeof n.metadata === "object" &&
                    "content" in n.metadata
                ) {
                    const c = (n.metadata as Record<string, unknown>).content;
                    return typeof c === "string" ? c : "";
                }
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }
    return JSON.stringify(result);
}

/** MCP server whose reads route through the GCP read gate via server.receive. */
export function createGcpMcpServer(config: GcpMcpServerConfig): McpServer {
    const handler = createFetchHandler({ server: config.server });
    const fetchImpl = (async (url, init) =>
        handler(new Request(String(url), init ?? undefined))) as typeof fetch;

    const mcp = new McpServer({
        name: config.info?.name ?? "gcp-mcp-expose",
        version: config.info?.version ?? "0.0.1",
    });

    for (const resource of config.resources) {
        mcp.registerResource(resource.name, resource.uri, {}, async (uri) => {
            const requester = createRequesterDescriptor(
                "principal:mcp-client",
                [],
                [],
            );
            const query = createContextQuery(
                `query:${crypto.randomUUID()}`,
                requester,
                resource.nodeId,
                "text",
                "mcp resource read",
            );
            const result = await queryRemoteContext({
                url: EXPOSE_URL,
                query,
                credentials: config.credentials,
                fetchImpl,
            });
            if (result.status !== "ok") {
                return { contents: [] };
            }
            // result.result may be a raw string (markdown-backed adapters set
            // KnowledgeQueryResult.raw to a string), a KnowledgeNode[] array,
            // or some other object. Handle all three shapes.
            const text = extractResultText(result.result);
            if (!text) {
                return { contents: [] };
            }
            return { contents: [{ uri: uri.href, text }] };
        });
    }
    return mcp;
}

export interface RawMcpResource {
    readonly uri: string;
    readonly name: string;
    readonly text: string;
}

/** Ungated MCP server (no policy) — the eval raw-mcp control. */
export function createRawMcpServer(config: {
    resources: ReadonlyArray<RawMcpResource>;
    info?: { name?: string; version?: string };
}): McpServer {
    const mcp = new McpServer({
        name: config.info?.name ?? "raw-mcp",
        version: config.info?.version ?? "0.0.1",
    });
    for (const resource of config.resources) {
        mcp.registerResource(resource.name, resource.uri, {}, async (uri) => ({
            contents: [{ uri: uri.href, text: resource.text }],
        }));
    }
    return mcp;
}
