/**
 * agent-core PeerContextToolFactory bound to the MCP substrate: each peer call
 * is an MCP `readResource` on the peer's resource URI (peer.endpoint), with
 * coupling metrics recorded at the call. Fail-soft on transport error and a
 * "MCP read denied" marker on empty contents — mirrors the GCP/A2A tools so the
 * shared brain behaves identically. The MCP client is injected via `connect`.
 *
 * @module mcp-peer-context-tool
 */

import type {
    CouplingMetrics,
    PeerContextToolFactory,
    PeerRef,
} from "@graph-context-protocol/agent-core";
import { type StructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";
import type { McpClientLike } from "./mcp-knowledge-adapter";

const InputSchema = z.object({
    question: z
        .string()
        .min(1)
        .describe("The natural-language question to ask the peer node"),
});

export interface McpPeerContextToolOptions {
    /** Connects an MCP client for the given peer (real or in-memory). */
    readonly connect: (peer: PeerRef) => Promise<McpClientLike>;
}

const DENIED = "MCP read denied: no content returned";

/** Builds a PeerContextToolFactory bound to the MCP read substrate. */
export function createMcpPeerContextToolFactory(
    opts: McpPeerContextToolOptions,
): PeerContextToolFactory {
    return (peer: PeerRef, metrics: CouplingMetrics): StructuredTool =>
        tool(
            async (input: unknown): Promise<string> => {
                InputSchema.parse(input);
                metrics.recordPeerContacted(peer.peerId);
                metrics.recordMessageSent();
                try {
                    const client = await opts.connect(peer);
                    const { contents } = await client.readResource({
                        uri: peer.endpoint,
                    });
                    const text = contents
                        .map((c) => c.text ?? "")
                        .join("")
                        .trim();
                    return text === "" ? DENIED : text;
                } catch (cause) {
                    const message =
                        cause instanceof Error ? cause.message : String(cause);
                    return `Failed to reach peer node: ${message}`;
                }
            },
            {
                name: `mcp_read_peer__${peer.targetNodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
                description: `Read the peer node "${peer.targetNodeId}" as an MCP resource. Use this to learn what the other node knows.`,
                schema: InputSchema,
            },
        );
}
