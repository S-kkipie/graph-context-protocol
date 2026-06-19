/**
 * Substrate-neutral coupling-metric seam, measured at the agent's
 * peer-call boundary. Both the GCP arm and the A2A baseline increment the
 * SAME interface so the comparison is symmetric by construction.
 *
 * @module metrics
 */

/** Opaque per-peer auth payload; each substrate interprets `value`. */
export interface Credentials {
    readonly type: string;
    readonly value: unknown;
    readonly metadata?: Record<string, unknown>;
}

/** Pull-based coupling counts for one agent over a run. */
export interface CouplingMetricsSnapshot {
    /** Peers this agent was given (its peer list length). */
    readonly peersKnown: number;
    /** Distinct peers this agent had to contact (Set-deduped). */
    readonly connectionsOpened: number;
    /** Total peer messages sent. */
    readonly messagesSent: number;
}

/** Mutable coupling-metric accumulator. */
export interface CouplingMetrics {
    recordPeerContacted(peerId: string): void;
    recordMessageSent(): void;
    setPeersKnown(count: number): void;
    snapshot(): CouplingMetricsSnapshot;
}

/**
 * Creates an in-memory accumulator. `connectionsOpened` is the count of
 * DISTINCT peers contacted; `messagesSent` is the total peer message count;
 * `peersKnown` is set explicitly (usually the agent's peer-list length).
 */
export function createCouplingMetrics(): CouplingMetrics {
    let peersKnown = 0;
    let messagesSent = 0;
    const contacted = new Set<string>();
    return {
        recordPeerContacted(peerId: string): void {
            contacted.add(peerId);
        },
        recordMessageSent(): void {
            messagesSent += 1;
        },
        setPeersKnown(count: number): void {
            peersKnown = count;
        },
        snapshot(): CouplingMetricsSnapshot {
            return {
                peersKnown,
                connectionsOpened: contacted.size,
                messagesSent,
            };
        },
    };
}
