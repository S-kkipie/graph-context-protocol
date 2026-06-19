/**
 * A2A-arm binding of the neutral PeerContextToolFactory: each peer call is an
 * A2A `sendMessage` to the peer's server, with coupling metrics recorded at
 * the call. Fail-soft on transport error (mirrors the GCP tool) so the brain
 * behaves identically across arms.
 *
 * @module a2a-peer-context-tool
 */

import { ClientFactory } from "@a2a-js/sdk/client";
import type {
    CouplingMetrics,
    PeerContextToolFactory,
    PeerRef,
} from "@graph-context-protocol/agent-core";
import { type StructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";

const InputSchema = z.object({
    question: z
        .string()
        .min(1)
        .describe("The natural-language question to ask the peer node"),
});

export interface A2aPeerContextToolOptions {
    /** Injectable client factory for testing. Defaults to A2A ClientFactory. */
    readonly clientFactory?: () => {
        createFromUrl(url: string): Promise<{
            sendMessage(params: unknown): Promise<unknown>;
        }>;
    };
}

type A2aResult = {
    kind?: string;
    parts?: Array<{ kind?: string; text?: string }>;
    artifacts?: Array<{ parts?: Array<{ kind?: string; text?: string }> }>;
};

function extractText(result: unknown): string {
    const r = result as A2aResult;
    if (r.kind === "task") {
        const part = r.artifacts?.[0]?.parts?.[0];
        return part?.text ?? "";
    }
    const part = r.parts?.[0];
    return part?.text ?? "";
}

/**
 * Builds a PeerContextToolFactory bound to the A2A message-passing substrate.
 */
export function createA2aPeerContextToolFactory(
    opts: A2aPeerContextToolOptions = {},
): PeerContextToolFactory {
    const makeFactory = opts.clientFactory ?? (() => new ClientFactory());
    return (peer: PeerRef, metrics: CouplingMetrics): StructuredTool =>
        tool(
            async (input: unknown): Promise<string> => {
                const { question } = InputSchema.parse(input);
                metrics.recordPeerContacted(peer.peerId);
                metrics.recordMessageSent();
                try {
                    const client = await makeFactory().createFromUrl(
                        peer.endpoint,
                    );
                    const result = await client.sendMessage({
                        message: {
                            kind: "message",
                            messageId: crypto.randomUUID(),
                            role: "user",
                            parts: [{ kind: "text", text: question }],
                        },
                    });
                    const text = extractText(result);
                    return text === "" ? "Peer returned no content." : text;
                } catch (cause) {
                    const message =
                        cause instanceof Error ? cause.message : String(cause);
                    return `Failed to reach peer node: ${message}`;
                }
            },
            {
                name: "query_peer_context",
                description: `Ask the peer node "${peer.targetNodeId}" for its context via an A2A message. Use this to learn what the other node knows or has done.`,
                schema: InputSchema,
            },
        );
}
