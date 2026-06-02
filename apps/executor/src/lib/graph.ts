import { SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
    createContextQueryTool,
    createOpenRouterLLM,
} from "@graph-context-protocol/langgraph";
import { env } from "@/env";

const llm = createOpenRouterLLM({
    model: env.OPENROUTER_MODEL,
    temperature: 0.2,
});

const peerTool = createContextQueryTool({
    peerUrl: env.PEER_GCP_URL,
    targetNodeId: "knowledge:researcher-context",
});

const systemPrompt = new SystemMessage(
    `You are the EXECUTOR node in a Graph Context Protocol network.
You own a log of completed results and actions.
When the user asks what tasks are pending or what the researcher wants, use the
"query_peer_context" tool to read the researcher node's shared context, then
answer based on what you learn.`,
);

export const graph = createReactAgent({
    llm,
    tools: [peerTool],
    prompt: systemPrompt,
});
