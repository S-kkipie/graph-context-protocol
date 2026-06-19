/**
 * A2A AgentExecutor for an agent node: runs the SHARED brain (createTaskAgent)
 * whose peer-context tool sends A2A messages to provider nodes. Publishes the
 * agent's final answer as the task result. Makes the baseline a complete,
 * faithful A2A artifact (every node is a server).
 *
 * @module agent-executor
 */

import type {
    AgentExecutor,
    ExecutionEventBus,
    RequestContext,
} from "@a2a-js/sdk/server";
import {
    type AgentNodeDef,
    type CouplingMetrics,
    createTaskAgent,
    type PeerRef,
    runTaskAgent,
    type TaskAgentConfig,
} from "@graph-context-protocol/agent-core";
import { createA2aPeerContextToolFactory } from "./a2a-peer-context-tool";

export class BrainExecutor implements AgentExecutor {
    private readonly agent: ReturnType<typeof createTaskAgent>;

    constructor(
        node: AgentNodeDef,
        peers: ReadonlyArray<PeerRef>,
        metrics: CouplingMetrics,
        llm: TaskAgentConfig["llm"],
    ) {
        this.agent = createTaskAgent({
            llm,
            systemPrompt: node.systemPrompt,
            peers,
            toolFactory: createA2aPeerContextToolFactory(),
            metrics,
        });
    }

    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus,
    ): Promise<void> {
        const { taskId, contextId, userMessage } = requestContext;
        const goalPart = userMessage.parts?.find((p) => "text" in p);
        const goal =
            goalPart && "text" in goalPart ? (goalPart.text ?? "") : "";
        const answer = await runTaskAgent(this.agent, goal);

        eventBus.publish({
            kind: "task",
            id: taskId,
            contextId,
            status: { state: "submitted", timestamp: new Date().toISOString() },
            history: [userMessage],
        });
        eventBus.publish({
            kind: "artifact-update",
            taskId,
            contextId,
            artifact: {
                artifactId: "answer",
                name: "answer.txt",
                parts: [{ kind: "text", text: answer }],
            },
        });
        eventBus.publish({
            kind: "status-update",
            taskId,
            contextId,
            status: { state: "completed", timestamp: new Date().toISOString() },
            final: true,
        });
        eventBus.finished();
    }

    // SDK 0.3.x: cancelTask takes (taskId: string, eventBus: ExecutionEventBus)
    cancelTask = async (
        _taskId: string,
        _eventBus: ExecutionEventBus,
    ): Promise<void> => {};
}
