/**
 * In-memory peer registry for federated discovery.
 *
 * @module peers/types
 */

import type {
    ContextPeerDescriptor,
    NodeId,
    Result,
} from "@graph-context-protocol/core";
import type { ServerError } from "../errors";

/** Pull-based snapshot of the peer registry (coupling-metric input). */
export interface PeerRegistrySnapshot {
    readonly totalPeers: number;
}

/** Copy-on-write immutable registry of known peer descriptors. */
export interface PeerRegistry {
    /** Registers a peer; returns a NEW registry. */
    register(peer: ContextPeerDescriptor): Result<PeerRegistry, ServerError>;
    /** Looks up a peer by its `peerId`. */
    get(peerId: string): ContextPeerDescriptor | undefined;
    /** Resolves the peer that exposes the given knowledge node id, if any. */
    getByKnowledgeNodeId(nodeId: NodeId): ContextPeerDescriptor | undefined;
    /** Lists all known peers. */
    list(): readonly ContextPeerDescriptor[];
    /** Removes a peer by `peerId`; returns a NEW registry. */
    unregister(peerId: string): Result<PeerRegistry, ServerError>;
    /** Returns a pull-based snapshot. */
    snapshot(): PeerRegistrySnapshot;
}
