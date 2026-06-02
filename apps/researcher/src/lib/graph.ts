import { SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
    createContextQueryTool,
    createOpenRouterLLM,
} from "@graph-context-protocol/langgraph";
import { env } from "@/env";

const llm = createOpenRouterLLM({
    model: env.OPENROUTER_MODEL,
    temperature: 0.7,
});

const peerTool = createContextQueryTool({
    peerUrl: env.PEER_GCP_URL,
    targetNodeId: "knowledge:executor-context",
});

const systemPrompt = new SystemMessage(
    `You are the RESEARCHER node in a Graph Context Protocol network.
You own a list of pending tasks and research notes.
When the user asks about what the executor has done or its status, use the
"query_peer_context" tool to read the executor node's shared context, then
answer based on what you learn.`,
);

export const graph = createReactAgent({
    llm,
    tools: [peerTool],
    prompt: systemPrompt,
});
