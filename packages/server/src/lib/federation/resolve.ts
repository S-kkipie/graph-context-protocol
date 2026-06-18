/**
 * Federated context-query resolution: local-vs-peer routing without a global
 * graph. Local targets go to the local handler; peer-owned targets are
 * contacted via the request/response client (`queryRemoteContext`). Coupling
 * metrics are recorded for the M5 harness.
 *
 * @module federation/resolve
 */

import type {
    ContextQuery,
    ContextQueryResult,
    NodeId,
} from "@graph-context-protocol/core";
import { createContextQueryResult } from "@graph-context-protocol/core";
import type { Credentials } from "../auth/types";
import { queryRemoteContext } from "../http/fetch-client";
import type { CouplingMetrics } from "../metrics/types";
import type { PeerRegistry } from "../peers/types";

/** Options for {@link resolveContextQuery}. */
export interface ResolveContextQueryOptions {
    readonly query: ContextQuery;
    readonly localNodeId: NodeId;
    /** Returns true if the target knowledge node is owned by THIS node. */
    readonly isLocalTarget: (nodeId: NodeId) => boolean;
    readonly peers: PeerRegistry;
    /** Handles a query whose target is local. */
    readonly localHandler: (query: ContextQuery) => Promise<ContextQueryResult>;
    readonly credentials?: Credentials;
    readonly fetchImpl?: typeof fetch;
    readonly metrics?: CouplingMetrics;
    /** Injectable request/response client (defaults to queryRemoteContext). */
    readonly queryFn?: typeof queryRemoteContext;
}

/**
 * Resolves a context query to either the local handler or the owning peer.
 *
 * @param options - The query plus local/peer resolution inputs
 * @returns The context-query result
 */
export async function resolveContextQuery(
    options: ResolveContextQueryOptions,
): Promise<ContextQueryResult> {
    const {
        query,
        localNodeId,
        isLocalTarget,
        peers,
        localHandler,
        credentials,
        fetchImpl,
        metrics,
        queryFn = queryRemoteContext,
    } = options;

    metrics?.setPeersKnown(peers.snapshot().totalPeers);

    if (isLocalTarget(query.targetNodeId)) {
        return localHandler(query);
    }

    const peer = peers.getByKnowledgeNodeId(query.targetNodeId);
    if (peer === undefined) {
        return createContextQueryResult(
            query.queryId,
            "not-found",
            localNodeId,
            {},
            undefined,
            `No known peer owns ${query.targetNodeId}`,
        );
    }

    metrics?.recordPeerContacted(peer.peerId);
    metrics?.recordMessageSent();

    return queryFn({
        url: peer.queryEndpoint ?? peer.endpoint,
        query,
        credentials,
        fetchImpl,
    });
}
