import { createNodeAgent } from "@graph-context-protocol/scenario";
import { env } from "@/env";

export const graph = createNodeAgent({
    llm: { model: env.OPENROUTER_MODEL, temperature: 0.2 },
    peers: [
        { peerUrl: env.PEER_GCP_URL, targetNodeId: "knowledge:researcher-context" },
    ],
    systemPrompt: `You are the EXECUTOR node in a Graph Context Protocol network.
You own a log of completed results and actions.
When the user asks what tasks are pending or what the researcher wants, use the
"query_peer_context" tool to read the researcher node's shared context, then
answer based on what you learn.`,
});
