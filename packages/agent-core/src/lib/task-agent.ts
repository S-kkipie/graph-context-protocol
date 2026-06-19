/**
 * The shared agent brain: a react agent whose per-peer tools are injected via
 * a substrate-specific PeerContextToolFactory. Identical across both arms.
 *
 * @module task-agent
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createOpenRouterLLM } from "./llm";
import type { TaskAgentConfig } from "./types";

/**
 * Builds a react agent over the configured peers. Construction makes no
 * network call; `setPeersKnown` records the peer count and the tool factory
 * builds one tool per peer (the per-call coupling metrics live inside it).
 */
export function createTaskAgent(config: TaskAgentConfig) {
    const llm = createOpenRouterLLM({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        temperature: config.llm.temperature,
    });
    config.metrics.setPeersKnown(config.peers.length);
    const tools = config.peers.map((peer) =>
        config.toolFactory(peer, config.metrics),
    );
    return createReactAgent({
        llm,
        tools,
        prompt: new SystemMessage(config.systemPrompt),
    });
}

/**
 * Runs a task agent against a goal and returns its final textual answer.
 * Single answer-extraction path so both arms read results identically.
 */
export async function runTaskAgent(
    agent: ReturnType<typeof createTaskAgent>,
    goal: string,
): Promise<string> {
    const result = await agent.invoke({
        messages: [new HumanMessage(goal)],
    });
    const messages = result.messages;
    const last = messages[messages.length - 1];
    return typeof last.content === "string"
        ? last.content
        : JSON.stringify(last.content);
}
