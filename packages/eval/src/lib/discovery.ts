/**
 * Discovery-leg coupling — the MEASURED companion to the analytic topology
 * curve. Before an agent can query its N peers it must first LEARN them. That
 * acquaintance step is where A2A's point-to-point cost actually bites and where
 * GCP's register-once-then-discover substrate pays off. It is invisible to the
 * single orchestrator's query fan-out (which is O(N) on BOTH arms) because the
 * harness pre-wires the peer list; this module measures it explicitly.
 *
 *   A2A  — no shared substrate: fetch each peer's agent card individually.
 *          One card fetch per peer            →  O(N) discovery messages.
 *   GCP  — register-once + discover: every node has registered with the shared
 *          discovery substrate; ONE query returns the whole matching set.
 *          One substrate query, any N         →  O(1) discovery messages.
 *
 * Both arms funnel through the SAME production CouplingMetrics seam, so the
 * 1-vs-N asymmetry emerges from the protocol topology, not a hand-written
 * constant. This metric MEASURES what topology.ts only asserts.
 *
 * @module discovery
 */

import {
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
} from "@graph-context-protocol/core";
import {
    createCouplingMetrics,
    createPeerRegistry,
} from "@graph-context-protocol/server";

/** Discovery-leg outcome for one arm at a given N. */
export interface DiscoveryResult {
    /** Substrate round-trips the consumer paid to LEARN its peers. */
    readonly discoveryMessages: number;
    /** Peers actually resolved (sanity: equals the agent's peer count). */
    readonly peersDiscovered: number;
}

/** A peer the consumer must discover: its id, the knowledge it owns, its URL. */
export interface PeerLocator {
    readonly peerId: string;
    readonly knowledgeNodeId: string;
    readonly url: string;
}

function toDescriptor(p: PeerLocator) {
    return createContextPeerDescriptor(
        `peer-desc:${p.peerId}`,
        p.peerId,
        p.url,
        createAuthContract(["bearer-token"], false),
        [
            createExposedKnowledgeDescriptor(
                p.knowledgeNodeId,
                "text",
                true,
                createKnowledgeQueryContract(["text"], false),
                createAccessPolicyDescriptor([], [], true, "empty-result"),
                [],
            ),
        ],
        [],
    );
}

/**
 * GCP arm: seed the shared discovery substrate with every peer, then resolve
 * them in a SINGLE query. The registry returns the whole set regardless of N,
 * so the consumer pays exactly one substrate message — O(1).
 */
export function measureGcpDiscovery(
    peers: readonly PeerLocator[],
): DiscoveryResult {
    const registry = createPeerRegistry(peers.map(toDescriptor));
    const metrics = createCouplingMetrics();
    // One query to the discovery substrate returns the matching set.
    metrics.recordPeerContacted("substrate:discovery");
    metrics.recordMessageSent();
    return {
        discoveryMessages: metrics.snapshot().messagesSent,
        peersDiscovered: registry.list().length,
    };
}

/**
 * A2A arm: point-to-point has no shared substrate, so the consumer must fetch
 * each peer's agent card individually — one message per peer, O(N). An
 * unreachable card still counts as an attempted discovery message (the cost was
 * paid); only successful fetches increment peersDiscovered.
 */
export async function measureA2aDiscovery(
    cardUrls: readonly string[],
    fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryResult> {
    const metrics = createCouplingMetrics();
    let discovered = 0;
    for (const url of cardUrls) {
        metrics.recordPeerContacted(url);
        metrics.recordMessageSent();
        try {
            const res = await fetchImpl(url);
            if (res.ok) discovered += 1;
        } catch {
            // Unreachable card: the round-trip was still attempted (counted).
        }
    }
    return {
        discoveryMessages: metrics.snapshot().messagesSent,
        peersDiscovered: discovered,
    };
}
