import {
    createContextQueryTool,
    createOpenRouterLLM,
} from "@graph-context-protocol/langgraph";
import { SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { NodeAgentConfig } from "./config";

/**
 * Builds a react agent that can read peer context over GCP.
 *
 * Parameterized extraction of the (previously duplicated) researcher/executor
 * `graph.ts`: one read-only `query_peer_context` tool per configured peer.
 */
export function createNodeAgent(config: NodeAgentConfig) {
    const llm = createOpenRouterLLM({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        temperature: config.llm.temperature,
    });

    const tools = config.peers.map((peer) =>
        createContextQueryTool({
            peerUrl: peer.peerUrl,
            targetNodeId: peer.targetNodeId,
        }),
    );

    return createReactAgent({
        llm,
        tools,
        prompt: new SystemMessage(config.systemPrompt),
    });
}
