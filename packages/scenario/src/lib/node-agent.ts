import {
    type CouplingMetrics,
    createCouplingMetrics,
    createTaskAgent,
    type PeerRef,
} from "@graph-context-protocol/agent-core";
import type { NodeAgentConfig } from "./config";
import { createGcpPeerContextToolFactory } from "./gcp-peer-context-tool";

/**
 * Builds a react agent that can read peer context over GCP.
 *
 * Thin GCP-arm wrapper over the shared `createTaskAgent`: it maps the node's
 * peer config to neutral PeerRefs and binds the GCP federated-read substrate.
 * The optional `metrics` lets a harness collect coupling counts; omitted
 * callers (the Next apps) get a private accumulator and are unaffected.
 */
export function createNodeAgent(
    config: NodeAgentConfig,
    opts: { metrics?: CouplingMetrics } = {},
) {
    const metrics = opts.metrics ?? createCouplingMetrics();
    const peers: PeerRef[] = config.peers.map((peer) => ({
        peerId: peer.targetNodeId,
        targetNodeId: peer.targetNodeId,
        endpoint: peer.peerUrl,
        credentials: peer.credentials as PeerRef["credentials"],
    }));
    return createTaskAgent({
        llm: config.llm,
        systemPrompt: config.systemPrompt,
        peers,
        toolFactory: createGcpPeerContextToolFactory(),
        metrics,
    });
}
