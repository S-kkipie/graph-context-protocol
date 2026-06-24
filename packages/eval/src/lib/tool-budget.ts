/**
 * Tool-prompt budget — the prompt-token lever, MEASURED from the real tool
 * schemas each arm binds. An LLM re-receives every bound tool's definition
 * (name + description + JSON schema) on every react turn, so the tool-binding
 * model is a direct, per-turn prompt-token cost:
 *
 *   A2A  — point-to-point binds ONE tool per agent card → O(N) tool schemas.
 *   GCP  — read-first binds ONE `query_context` tool over the whole graph,
 *          target id passed as an argument → O(1) tool schemas, any N.
 *
 * This is structural (the protocol's prescribed binding, like the topology
 * curve), but expressed in TOKENS and grounded in the actual tool definitions
 * the factories produce — not an abstract count. It predicts the live
 * behavioral `tokens` gap: under a real LLM the GCP arm's prompt carries one
 * tool schema where A2A carries N. (To confirm end-to-end, run the GCP arm with
 * the single tool via `EVAL_GCP_SINGLE_TOOL=1`.)
 *
 * @module tool-budget
 */

import {
    createCouplingMetrics,
    type PeerRef,
} from "@graph-context-protocol/agent-core";
import { createA2aPeerContextToolFactory } from "@graph-context-protocol/baseline";
import { createGcpQueryToolFactory } from "@graph-context-protocol/scenario";
import type { StructuredTool } from "@langchain/core/tools";
import type { Arm } from "./runner";

export interface ToolBudget {
    /** Tool schemas the agent exposes to the LLM: GCP 1, A2A N. */
    readonly toolsExposed: number;
    /** Estimated per-turn prompt tokens for those tool definitions. */
    readonly toolPromptTokens: number;
}

// Per-tool JSON-schema boilerplate the model also sees (type/required/etc.),
// beyond the name + description text. A flat estimate — the O(1)-vs-O(N) ratio
// is dominated by the tool COUNT, not this constant.
const SCHEMA_TOKENS_PER_TOOL = 12;

/** Rough token footprint of one tool's LLM-facing definition (~chars/4). */
function footprintTokens(t: StructuredTool): number {
    const text = `${t.name}\n${t.description ?? ""}`;
    return Math.ceil(text.length / 4) + SCHEMA_TOKENS_PER_TOOL;
}

/**
 * Measures the tool-prompt budget for `arm` over the given peers, from the real
 * tools the arm's factory builds.
 */
export function measureToolBudget(
    arm: Arm,
    peers: readonly PeerRef[],
): ToolBudget {
    const metrics = createCouplingMetrics();
    if (arm === "a2a") {
        const factory = createA2aPeerContextToolFactory();
        const tools = peers.map((p) => factory(p, metrics));
        return {
            toolsExposed: tools.length,
            toolPromptTokens: tools.reduce(
                (sum, t) => sum + footprintTokens(t),
                0,
            ),
        };
    }
    // GCP read-first: ONE tool over the whole graph, regardless of peer count.
    const tool = createGcpQueryToolFactory({
        resolveEndpoint: () => "http://substrate",
    })(metrics);
    return { toolsExposed: 1, toolPromptTokens: footprintTokens(tool) };
}
