/**
 * Topology variants — the honest framing of the structural results. The
 * headline n(n-1) vs n comparison contrasts a full A2A MESH with a GCP HUB, so
 * it measures topology, not protocol. A2A deployed through an orchestrator or
 * registry is also O(n), and a single generic "send task to agent X" tool is
 * also O(1) in tool-prompt tokens. This module computes those like-for-like
 * variants from the same real tool schemas, so the paper can state exactly what
 * is protocol-specific (policy and audit living with the node, one wire format
 * for read AND delegate) and what is merely topology.
 *
 * @module topology-variants
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { measureToolBudget } from "./tool-budget";

/** Integration edges by topology for n participants (directed, as in the paper). */
export interface EdgeVariants {
    /** A2A, every agent holds a card for every other: n(n-1). */
    readonly a2aMesh: number;
    /** A2A through an orchestrator / registry: every agent connects once: n. */
    readonly a2aHub: number;
    /** GCP, every agent connects to the one server: n. */
    readonly gcpHub: number;
}

export function edgeVariants(n: number): EdgeVariants {
    const size = Math.max(0, n);
    return { a2aMesh: size * (size - 1), a2aHub: size, gcpHub: size };
}

/** Tool-prompt tokens by tool-binding style for n peers. */
export interface ToolPromptVariants {
    /** A2A, one tool per peer agent card (the stock factory): O(n). */
    readonly a2aPerPeer: number;
    /** A2A, ONE generic `send_task(agent_id, question)` tool: O(1). */
    readonly a2aSingleTool: number;
    /** GCP, one `query_context` tool: O(1). */
    readonly gcpSingleTool: number;
}

const SCHEMA_TOKENS_PER_TOOL = 12; // keep in sync with tool-budget.ts

function footprint(name: string, description: string): number {
    return (
        Math.ceil(`${name}\n${description}`.length / 4) + SCHEMA_TOKENS_PER_TOOL
    );
}

/** The single generic A2A tool an orchestrator-style integration would bind. */
export function a2aSingleToolFootprint(): number {
    const t = tool(async () => "", {
        name: "send_task_to_agent",
        description:
            "Send a natural-language task or question to a named remote agent over A2A and return its reply. Pass the target agent id and the message.",
        schema: z.object({ agentId: z.string(), question: z.string() }),
    });
    return footprint(t.name, t.description ?? "");
}

export function toolPromptVariants(n: number): ToolPromptVariants {
    const peers = Array.from({ length: n }, (_, i) => ({
        peerId: `knowledge:peer-${i}`,
        targetNodeId: `knowledge:peer-${i}`,
        endpoint: "http://localhost",
    }));
    return {
        a2aPerPeer: measureToolBudget("a2a", peers).toolPromptTokens,
        a2aSingleTool: a2aSingleToolFootprint(),
        gcpSingleTool: measureToolBudget("gcp", peers).toolPromptTokens,
    };
}
