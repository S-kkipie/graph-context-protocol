/**
 * LangChain tool that issues a read-first GCP context-query to a peer node.
 *
 * @module context-query-tool
 */

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

/**
 * Configuration for {@link createContextQueryTool}.
 */
export interface ContextQueryToolConfig {
    /** Absolute URL of the peer node's context-query endpoint. */
    readonly peerUrl: string;
    /** Knowledge node id at the peer to query. */
    readonly targetNodeId: string;
    /** Tool name exposed to the LLM. Defaults to "query_peer_context". */
    readonly toolName?: string;
    /** Tool description override. */
    readonly description?: string;
    /** Principal id placed in the (audit-only) requester descriptor. */
    readonly requesterId?: string;
    /** Credentials sent to the peer under `gcp.credentials`. Defaults to anonymous. */
    readonly credentials?: Credentials;
    /** Injectable client for testing. Defaults to `queryRemoteContext`. */
    readonly queryFn?: typeof queryRemoteContext;
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
 * Builds a LangChain StructuredTool that reads a peer node's shared context.
 */
export function createContextQueryTool(
    config: ContextQueryToolConfig,
): StructuredTool {
    const {
        peerUrl,
        targetNodeId,
        toolName = "query_peer_context",
        requesterId = "principal:peer-agent",
        credentials,
        queryFn = queryRemoteContext,
    } = config;

    const description =
        config.description ??
        `Read the shared context owned by the peer node "${targetNodeId}" over the Graph Context Protocol. Use this to learn what the other node knows or has done.`;

    return tool(
        async (input: unknown): Promise<string> => {
            const { question } = InputSchema.parse(input);
            const requester = createRequesterDescriptor(requesterId, [], []);
            const query = createContextQuery(
                `query:${crypto.randomUUID()}`,
                requester,
                targetNodeId,
                "text",
                question,
            );

            try {
                const result = await queryFn({
                    url: peerUrl,
                    query,
                    credentials,
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
        { name: toolName, description, schema: InputSchema },
    );
}
