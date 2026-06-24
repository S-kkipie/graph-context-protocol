/**
 * GCP read-first SINGLE-tool binding. Where the per-peer factory
 * ({@link createGcpPeerContextToolFactory}) gives the agent one tool per peer
 * (O(N) tool schemas in the prompt), this gives the agent ONE `query_context`
 * tool that reaches every node in the graph: the model passes the target node
 * id as an argument and the substrate resolves it. That is the faithful
 * read-first model — register-once, discover, query — and it makes the
 * tool-definition prompt overhead O(1) instead of O(N). Coupling metrics are
 * recorded per call exactly as the per-peer tool does, so the query path stays
 * comparable.
 *
 * @module gcp-query-tool
 */

import type { CouplingMetrics } from "@graph-context-protocol/agent-core";
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

export interface GcpQueryToolOptions {
    /** Resolves a target knowledge node id to its query endpoint (the graph). */
    readonly resolveEndpoint: (targetNodeId: string) => string | undefined;
    /** Injectable client for testing. Defaults to `queryRemoteContext`. */
    readonly queryFn?: typeof queryRemoteContext;
    /** Per-target credentials, if the substrate requires them. */
    readonly credentialsFor?: (targetNodeId: string) => Credentials | undefined;
    /** Principal id placed in the (audit-only) requester descriptor. */
    readonly requesterId?: string;
}

const QueryInputSchema = z.object({
    targetNodeId: z
        .string()
        .min(1)
        .describe("The id of the context node to read from the graph"),
    question: z
        .string()
        .min(1)
        .describe("The natural-language question for that node's context"),
});

/**
 * Builds ONE GCP context-query tool over the whole graph. The returned factory
 * takes only the metrics sink (no per-peer binding): the single tool serves
 * every node, resolving the endpoint from the target id at call time.
 */
export function createGcpQueryToolFactory(
    opts: GcpQueryToolOptions,
): (metrics: CouplingMetrics) => StructuredTool {
    const queryFn = opts.queryFn ?? queryRemoteContext;
    const requesterId = opts.requesterId ?? "principal:peer-agent";
    return (metrics: CouplingMetrics): StructuredTool =>
        tool(
            async (input: unknown): Promise<string> => {
                const { targetNodeId, question } =
                    QueryInputSchema.parse(input);
                const endpoint = opts.resolveEndpoint(targetNodeId);
                if (!endpoint) {
                    return `No node "${targetNodeId}" is registered in the context graph.`;
                }
                metrics.recordPeerContacted(targetNodeId);
                metrics.recordMessageSent();
                const requester = createRequesterDescriptor(
                    requesterId,
                    [],
                    [],
                );
                const query = createContextQuery(
                    `query:${crypto.randomUUID()}`,
                    requester,
                    targetNodeId,
                    "text",
                    question,
                );
                try {
                    const result = await queryFn({
                        url: endpoint,
                        query,
                        credentials: opts.credentialsFor?.(targetNodeId),
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
                name: "query_context",
                description:
                    "Read shared context from the Graph Context Protocol substrate. Provide the target node id and a question; the substrate resolves the node and returns its context. ONE tool reaches every node in the graph — no per-peer binding.",
                schema: QueryInputSchema,
            },
        );
}
