/**
 * A2A AgentExecutor for a knowledge node. Applies card-declared COARSE
 * allow/deny: if the node exposes the provide-context skill it answers with
 * its content (canary included), otherwise it refuses. No role-gating — that
 * absence is the measured architectural difference vs the GCP arm.
 *
 * @module knowledge-executor
 */

import type {
    AgentExecutor,
    ExecutionEventBus,
    RequestContext,
} from "@a2a-js/sdk/server";
import {
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";

export class KnowledgeExecutor implements AgentExecutor {
    constructor(private readonly node: KnowledgeNodeDef) {}

    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus,
    ): Promise<void> {
        const { taskId, contextId } = requestContext;
        const exposes = this.node.exposedSkills.includes(PROVIDE_CONTEXT_SKILL);
        const text = exposes
            ? this.node.content
            : `Skill not available from ${this.node.nodeId}.`;

        eventBus.publish({
            kind: "task",
            id: taskId,
            contextId,
            status: { state: "submitted", timestamp: new Date().toISOString() },
            history: [],
        });
        eventBus.publish({
            kind: "artifact-update",
            taskId,
            contextId,
            artifact: {
                artifactId: "context",
                name: "context.md",
                parts: [{ kind: "text", text }],
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
