/**
 * In-memory coupling-metric accumulator.
 *
 * @module metrics/implementation
 */

import type { CouplingMetrics, CouplingMetricsSnapshot } from "./types";

/**
 * Creates an in-memory coupling-metric accumulator. `connectionsOpened` is the
 * count of DISTINCT peers contacted; `messagesSent` is the total peer message
 * count; `peersKnown` is set explicitly (usually the registry size).
 *
 * @returns A new CouplingMetrics
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
