/**
 * Scenario runner - executes the collaboration workflow with context propagation.
 * @module collaboration/scenario
 */

import {
    addProvenance,
    createContext,
    createContextFilter,
    createMessageHeader,
    createProtocolMessage,
    propagateContext,
} from "@graph-context-protocol/core";
import type {
    GraphContext,
    GraphNode,
    ProtocolMessage,
} from "@graph-context-protocol/core";
import { createAgentNodes, getAgentConfig } from "./agents";
import type {
    CollaborationStep,
    MessageTraceEntry,
    PropagationAttempt,
    ScenarioResult,
} from "./types";

/** Default collaboration workflow steps */
export function getDefaultSteps(): readonly CollaborationStep[] {
    return [
        {
            from: "planner",
            to: "researcher",
            edgeType: "depends-on",
            contextKeys: ["task.brief", "task.constraints"],
            filters: ["planner.notes"],
        },
        {
            from: "researcher",
            to: "writer",
            edgeType: "depends-on",
            contextKeys: [
                "task.brief",
                "task.constraints",
                "research.findings",
            ],
            filters: [],
        },
        {
            from: "writer",
            to: "reviewer",
            edgeType: "depends-on",
            contextKeys: ["task.brief", "research.findings", "draft.content"],
            filters: [],
        },
    ];
}

/** Creates the initial context from the planner */
function createInitialContext(plannerNode: GraphNode): GraphContext {
    const config = getAgentConfig("planner");

    return createContext(
        "ctx:initial",
        "graph:collaboration",
        plannerNode.id,
        config.role,
        {
            "task.brief":
                "Create a technical blog post about Graph Context Protocol",
            "task.constraints": "Maximum 1000 words, include code examples",
            "planner.notes":
                "Focus on practical use cases and real-world examples",
        },
    );
}

/** Performs a single propagation step */
function performPropagation(
    currentContext: GraphContext,
    fromNode: GraphNode,
    toNode: GraphNode,
    step: CollaborationStep,
): { context: GraphContext; attempt: PropagationAttempt } {
    const config = getAgentConfig(step.to);
    const filters =
        step.filters?.map((key) => createContextFilter(key, "exclude")) ?? [];

    const result = propagateContext(currentContext, toNode, filters);

    const excludedKeys = step.filters ?? [];
    const filteredData = result.success
        ? result.propagatedContext.accumulatedData
        : {};

    const attempt: PropagationAttempt = {
        success: result.success,
        from: step.from,
        to: step.to,
        contextId: currentContext.id,
        filteredData,
        excludedKeys,
    };

    if (!result.success) {
        return { context: currentContext, attempt };
    }

    const nextContext = createContext(
        `ctx:${step.to}`,
        "graph:collaboration",
        toNode.id,
        config.role,
        filteredData,
    );

    return { context: nextContext, attempt };
}

/** Creates a protocol message for a step */
function createStepMessage(
    fromNode: GraphNode,
    toNode: GraphNode,
    context: GraphContext,
    stepIndex: number,
): ProtocolMessage {
    const header = createMessageHeader(
        `msg:step-${stepIndex}`,
        fromNode.id,
        toNode.id,
        "action-request",
        { priority: "normal", ttl: 300 },
    );

    return createProtocolMessage(header, context, {
        action: stepIndex === 0 ? "start-research" : "continue-workflow",
    });
}

/** Creates a message trace entry */
function createTraceEntry(
    message: ProtocolMessage,
    from: string,
    to: string,
): MessageTraceEntry {
    return {
        messageId: message.header.messageId,
        from: from as "planner" | "researcher" | "writer" | "reviewer",
        to: to as "planner" | "researcher" | "writer" | "reviewer",
        timestamp: message.header.timestamp,
        provenance: message.provenance.map((p: { nodeId: string }) => p.nodeId),
    };
}

/** Runs the complete collaboration scenario */
export function runCollaborationScenario(): ScenarioResult {
    const startTime = new Date().toISOString();
    const nodes = createAgentNodes();
    const steps = getDefaultSteps();

    const propagations: PropagationAttempt[] = [];
    const messages: ProtocolMessage[] = [];
    const traces: MessageTraceEntry[] = [];

    let currentContext = createInitialContext(nodes.planner);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const fromNode = nodes[step.from];
        const toNode = nodes[step.to];

        const message = createStepMessage(fromNode, toNode, currentContext, i);
        messages.push(message);
        traces.push(createTraceEntry(message, step.from, step.to));

        const forwardedMessage = addProvenance(message, toNode.id, "processed");
        messages.push(forwardedMessage);

        const { context: nextContext, attempt } = performPropagation(
            currentContext,
            fromNode,
            toNode,
            step,
        );

        propagations.push(attempt);

        if (!attempt.success) {
            break;
        }

        currentContext = nextContext;
    }

    const endTime = new Date().toISOString();

    return {
        graph: {
            nodes: new Map([
                ["planner", nodes.planner],
                ["researcher", nodes.researcher],
                ["writer", nodes.writer],
                ["reviewer", nodes.reviewer],
            ]),
            edges: new Map(),
        },
        steps,
        propagations,
        messages,
        traces,
        finalContext: currentContext,
        startTime,
        endTime,
    };
}
