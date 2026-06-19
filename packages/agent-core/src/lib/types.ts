/**
 * Neutral agent-brain seam: a peer reference and the tool-factory the brain
 * uses to consult one peer. The factory is the ONLY thing that differs
 * between the GCP and A2A arms.
 *
 * @module types
 */

import type { StructuredTool } from "@langchain/core/tools";
import type { CouplingMetrics, Credentials } from "./metrics";

/** A peer an agent can consult. Endpoint meaning is substrate-specific. */
export interface PeerRef {
    readonly peerId: string;
    /** Knowledge/agent id at the peer (GCP target node id / A2A skill target). */
    readonly targetNodeId: string;
    /** Peer URL — GCP context-query URL, or A2A base URL. */
    readonly endpoint: string;
    readonly credentials?: Credentials;
}

/** Builds the LangChain tool the LLM calls to read one peer; records metrics. */
export type PeerContextToolFactory = (
    peer: PeerRef,
    metrics: CouplingMetrics,
) => StructuredTool;

/** Everything the shared brain needs; identical shape across both arms. */
export interface TaskAgentConfig {
    readonly llm: {
        readonly model?: string;
        readonly temperature?: number;
        readonly apiKey?: string;
    };
    readonly systemPrompt: string;
    readonly peers: ReadonlyArray<PeerRef>;
    readonly toolFactory: PeerContextToolFactory;
    readonly metrics: CouplingMetrics;
}
