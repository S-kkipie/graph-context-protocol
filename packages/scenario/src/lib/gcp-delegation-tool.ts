/**
 * GCP-arm delegation tool: each peer call DELEGATES a task to the peer node
 * over an `action-request`, gated by `cap:delegate-task` on the peer. Records
 * coupling metrics at the call; fails soft on transport error (mirrors the
 * read tool) so the brain behaves identically across arms.
 *
 * @module gcp-delegation-tool
 */

import type {
    CouplingMetrics,
    PeerContextToolFactory,
    PeerRef,
} from "@graph-context-protocol/agent-core";
import { createDelegationRequest } from "@graph-context-protocol/core";
import {
    type Credentials,
    delegateRemoteTask,
} from "@graph-context-protocol/server";
import { type StructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";

export interface GcpDelegationToolOptions {
    /** Injectable client for testing. Defaults to `delegateRemoteTask`. */
    readonly delegateFn?: typeof delegateRemoteTask;
    /** Principal id placed in the (audit-only) requester descriptor. */
    readonly requesterId?: string;
}

const InputSchema = z.object({
    task: z
        .string()
        .min(1)
        .describe("The task to delegate to the peer node's agent to perform"),
});

/**
 * Builds a PeerContextToolFactory that DELEGATES tasks (stricter than read) to
 * the GCP peer over the Graph Context Protocol.
 */
export function createGcpDelegationToolFactory(
    opts: GcpDelegationToolOptions = {},
): PeerContextToolFactory {
    const delegateFn = opts.delegateFn ?? delegateRemoteTask;
    const requesterId = opts.requesterId ?? "principal:peer-agent";
    return (peer: PeerRef, metrics: CouplingMetrics): StructuredTool =>
        tool(
            async (input: unknown): Promise<string> => {
                const { task } = InputSchema.parse(input);
                metrics.recordPeerContacted(peer.peerId);
                metrics.recordMessageSent();
                const request = createDelegationRequest(
                    `deleg:${crypto.randomUUID()}`,
                    {
                        principalId: requesterId,
                        roles: [],
                        capabilities: [],
                        metadata: {},
                    },
                    peer.targetNodeId,
                    task,
                );
                try {
                    const result = await delegateFn({
                        url: peer.endpoint,
                        request,
                        credentials: peer.credentials as
                            | Credentials
                            | undefined,
                    });
                    if (result.status === "completed") {
                        // Must NOT start with "Delegation " — the containment
                        // metric treats a leading "Delegation <status>" as a
                        // non-completion outcome.
                        return result.result ?? "(completed, no output)";
                    }
                    if (result.status === "denied") {
                        return `Delegation denied: ${result.error ?? "no detail"}`;
                    }
                    return `Delegation ${result.status}: ${result.error ?? "no detail"}`;
                } catch (cause) {
                    const message =
                        cause instanceof Error ? cause.message : String(cause);
                    return `Failed to reach peer node: ${message}`;
                }
            },
            {
                name: `delegate_task_to_peer__${peer.targetNodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
                description: `Delegate a task to the peer node "${peer.targetNodeId}" to perform over the Graph Context Protocol. Delegation requires stricter authority than reading.`,
                schema: InputSchema,
            },
        );
}
