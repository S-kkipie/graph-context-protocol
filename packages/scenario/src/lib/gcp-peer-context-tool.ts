/**
 * GCP-arm binding of the neutral PeerContextToolFactory: each peer call is a
 * read-first GCP context-query, with coupling metrics recorded at the call.
 *
 * @module gcp-peer-context-tool
 */

import type {
    CouplingMetrics,
    PeerContextToolFactory,
    PeerRef,
} from "@graph-context-protocol/agent-core";
import {
    createContextQuery,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import {
    type Credentials,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { type StructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";

export interface GcpPeerContextToolOptions {
    /** Injectable client for testing. Defaults to `queryRemoteContext`. */
    readonly queryFn?: typeof queryRemoteContext;
    /** Principal id placed in the (audit-only) requester descriptor. */
    readonly requesterId?: string;
}

const InputSchema = z.object({
    question: z
        .string()
        .min(1)
        .describe(
            "The natural-language question to ask the peer node's context",
        ),
});

/**
 * Builds a PeerContextToolFactory bound to the GCP federated-read substrate.
 */
export function createGcpPeerContextToolFactory(
    opts: GcpPeerContextToolOptions = {},
): PeerContextToolFactory {
    const queryFn = opts.queryFn ?? queryRemoteContext;
    const requesterId = opts.requesterId ?? "principal:peer-agent";
    return (peer: PeerRef, metrics: CouplingMetrics): StructuredTool =>
        tool(
            async (input: unknown): Promise<string> => {
                const { question } = InputSchema.parse(input);
                metrics.recordPeerContacted(peer.peerId);
                metrics.recordMessageSent();
                const requester = createRequesterDescriptor(
                    requesterId,
                    [],
                    [],
                );
                const query = createContextQuery(
                    `query:${crypto.randomUUID()}`,
                    requester,
                    peer.targetNodeId,
                    "text",
                    question,
                );
                try {
                    const result = await queryFn({
                        url: peer.endpoint,
                        query,
                        credentials: peer.credentials as
                            | Credentials
                            | undefined,
                    });
                    if (result.status !== "ok") {
                        return `Peer context query ${result.status}: ${result.error ?? "no detail"}`;
                    }
                    return typeof result.result === "string"
                        ? result.result
                        : JSON.stringify(result.result);
                } catch (cause) {
                    const message =
                        cause instanceof Error ? cause.message : String(cause);
                    return `Failed to reach peer node: ${message}`;
                }
            },
            {
                name: `query_peer_context__${peer.targetNodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
                description: `Read the shared context owned by the peer node "${peer.targetNodeId}" over the Graph Context Protocol. Use this to learn what the other node knows or has done.`,
                schema: InputSchema,
            },
        );
}
