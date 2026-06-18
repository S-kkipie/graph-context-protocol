/**
 * Coupling-metric seam for the M5 benchmark harness.
 *
 * @module metrics/types
 */

/** Pull-based coupling counts for one node over a run. */
export interface CouplingMetricsSnapshot {
    /** Number of peers this node knows (registry size). */
    readonly peersKnown: number;
    /** Distinct peers this node had to contact. */
    readonly connectionsOpened: number;
    /** Total peer messages sent. */
    readonly messagesSent: number;
}

/** Mutable coupling-metric accumulator. */
export interface CouplingMetrics {
    /** Records that a peer was contacted (deduped → connectionsOpened). */
    recordPeerContacted(peerId: string): void;
    /** Increments the messages-sent counter. */
    recordMessageSent(): void;
    /** Sets the peers-known count (typically registry size). */
    setPeersKnown(count: number): void;
    /** Returns the current snapshot. */
    snapshot(): CouplingMetricsSnapshot;
}
