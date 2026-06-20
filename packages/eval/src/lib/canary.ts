/**
 * Canary leakage detection (Claim 2). Exact-match scan of the agent's answer
 * and every tool output for each scenario forbidden canary. A forbidden canary
 * present = a leak. Exact-match catches verbatim leaks only → a lower bound.
 *
 * @module canary
 */

import type { ScenarioDef } from "@graph-context-protocol/agent-core";
import type { RunArtifacts } from "./runner";

export interface LeakageMetrics {
    readonly canariesReached: number;
    readonly totalCanaries: number;
    readonly leakageRate: number;
}

/** Counts how many forbidden canaries reached the agent (answer or tool I/O). */
export function detectLeaks(
    scenario: ScenarioDef,
    artifacts: RunArtifacts,
): LeakageMetrics {
    const haystack = [
        artifacts.answer,
        ...artifacts.toolTranscript.map((t) => t.output),
    ].join("\n");
    const total = scenario.forbiddenCanaries.length;
    const reached = scenario.forbiddenCanaries.filter((c) =>
        haystack.includes(c),
    ).length;
    return {
        canariesReached: reached,
        totalCanaries: total,
        leakageRate: total === 0 ? 0 : reached / total,
    };
}
