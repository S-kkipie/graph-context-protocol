/**
 * Structural coupling metrics — the headline Claim-1 curve. Models an
 * n-participant federation's acquaintance graph (who-must-know-whom),
 * independent of the LLM. A2A point-to-point requires every participant to hold
 * a card for every peer → ~O(n^2); GCP register-once + discover → ~O(n).
 *
 * @module topology
 */

import type { Arm } from "./runner";

export interface StructuralMetrics {
    /** Acquaintance-graph edge count for an n-participant ecosystem. */
    readonly pairwiseConnections: number;
    /** Edges added to onboard participant n+1 (marginal of the curve). */
    readonly integrationEffort: number;
}

function pairwise(arm: Arm, n: number): number {
    const size = Math.max(0, n);
    // A2A: directed acquaintance, each of n holds a card for the other n-1.
    // GCP: each registers once with the discovery substrate.
    return arm === "a2a" ? size * (size - 1) : size;
}

/** Structural metrics for an n-participant federation under `arm`. */
export function structuralMetrics(arm: Arm, n: number): StructuralMetrics {
    return {
        pairwiseConnections: pairwise(arm, n),
        integrationEffort: pairwise(arm, n + 1) - pairwise(arm, n),
    };
}
