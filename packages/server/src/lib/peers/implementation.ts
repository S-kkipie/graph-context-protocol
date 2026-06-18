/**
 * In-memory immutable peer registry implementation.
 *
 * @module peers/implementation
 */

import type {
    ContextPeerDescriptor,
    NodeId,
} from "@graph-context-protocol/core";
import { fail, succeed } from "@graph-context-protocol/core";
import { createServerError } from "../errors";
import type { PeerRegistry } from "./types";

function build(
    peers: ReadonlyMap<string, ContextPeerDescriptor>,
): PeerRegistry {
    return {
        register(peer: ContextPeerDescriptor) {
            if (peers.has(peer.peerId)) {
                return fail(
                    createServerError(
                        "conflict",
                        `Peer already registered: ${peer.peerId}`,
                    ),
                );
            }
            const next = new Map(peers);
            next.set(peer.peerId, peer);
            return succeed(build(next));
        },
        get(peerId: string) {
            return peers.get(peerId);
        },
        getByKnowledgeNodeId(nodeId: NodeId) {
            for (const peer of peers.values()) {
                if (
                    peer.exposedKnowledge.some(
                        (knowledge) => knowledge.nodeId === nodeId,
                    )
                ) {
                    return peer;
                }
            }
            return undefined;
        },
        list() {
            return [...peers.values()];
        },
        unregister(peerId: string) {
            if (!peers.has(peerId)) {
                return fail(
                    createServerError(
                        "not-found",
                        `Peer not registered: ${peerId}`,
                    ),
                );
            }
            const next = new Map(peers);
            next.delete(peerId);
            return succeed(build(next));
        },
        snapshot() {
            return { totalPeers: peers.size };
        },
    };
}

/**
 * Creates an in-memory peer registry, optionally seeded with descriptors.
 *
 * @param initial - Peer descriptors to seed (deduped by peerId, last wins)
 * @returns A new PeerRegistry
 */
export function createPeerRegistry(
    initial: readonly ContextPeerDescriptor[] = [],
): PeerRegistry {
    const map = new Map<string, ContextPeerDescriptor>();
    for (const peer of initial) {
        map.set(peer.peerId, peer);
    }
    return build(map);
}
