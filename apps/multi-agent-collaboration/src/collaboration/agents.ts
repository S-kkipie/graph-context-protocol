/**
 * Agent factory - creates capabilities, roles, nodes, and edges for collaboration.
 * @module collaboration/agents
 */

import {
    createCapability,
    createEdge,
    createNode,
    createRole,
    SystemCapabilities,
} from "@graph-context-protocol/core";
import type { AgentConfig, AgentKind, CollaborationGraph } from "./types";

/** Creates all capabilities needed for the collaboration workflow */
export function createCollaborationCapabilities() {
    return {
        readContext: createCapability(
            SystemCapabilities.READ_CONTEXT,
            "Read Context",
            "Can read context data from nodes",
        ),
        writeContext: createCapability(
            SystemCapabilities.WRITE_CONTEXT,
            "Write Context",
            "Can write context data to nodes",
        ),
        traverseGraph: createCapability(
            SystemCapabilities.TRAVERSE_GRAPH,
            "Traverse Graph",
            "Can traverse graph edges",
        ),
        sendMessages: createCapability(
            SystemCapabilities.SEND_MESSAGES,
            "Send Messages",
            "Can send protocol messages",
        ),
        receiveMessages: createCapability(
            SystemCapabilities.RECEIVE_MESSAGES,
            "Receive Messages",
            "Can receive protocol messages",
        ),
    };
}

/** Creates role definitions for each agent type */
export function createCollaborationRoles() {
    const caps = createCollaborationCapabilities();

    const planner = createRole(
        "role:planner",
        "Planner",
        "Plans tasks and defines goals",
        [caps.readContext, caps.writeContext, caps.sendMessages],
        [
            { path: "task.brief", access: "read" },
            { path: "task.brief", access: "write" },
            { path: "task.constraints", access: "read" },
            { path: "task.constraints", access: "write" },
            { path: "planner.notes", access: "read" },
            { path: "planner.notes", access: "write" },
        ],
    );

    const researcher = createRole(
        "role:researcher",
        "Researcher",
        "Gathers information and findings",
        [
            caps.readContext,
            caps.writeContext,
            caps.traverseGraph,
            caps.receiveMessages,
            caps.sendMessages,
        ],
        [
            { path: "task.brief", access: "read" },
            { path: "task.constraints", access: "read" },
            { path: "research.findings", access: "read" },
            { path: "research.findings", access: "write" },
        ],
    );

    const writer = createRole(
        "role:writer",
        "Writer",
        "Creates content based on research",
        [
            caps.readContext,
            caps.writeContext,
            caps.traverseGraph,
            caps.receiveMessages,
            caps.sendMessages,
        ],
        [
            { path: "task.brief", access: "read" },
            { path: "research.findings", access: "read" },
            { path: "draft.content", access: "read" },
            { path: "draft.content", access: "write" },
        ],
    );

    const reviewer = createRole(
        "role:reviewer",
        "Reviewer",
        "Reviews and provides feedback",
        [caps.readContext, caps.writeContext, caps.receiveMessages],
        [
            { path: "task.brief", access: "read" },
            { path: "draft.content", access: "read" },
            { path: "research.findings", access: "read" },
            { path: "review.notes", access: "read" },
            { path: "review.notes", access: "write" },
        ],
    );

    return { planner, researcher, writer, reviewer };
}

/** Gets agent configuration for a specific agent kind */
export function getAgentConfig(kind: AgentKind): AgentConfig {
    const roles = createCollaborationRoles();
    const caps = createCollaborationCapabilities();

    switch (kind) {
        case "planner":
            return {
                kind,
                role: roles.planner,
                capabilities: [
                    caps.readContext,
                    caps.writeContext,
                    caps.sendMessages,
                ],
            };
        case "researcher":
            return {
                kind,
                role: roles.researcher,
                capabilities: [
                    caps.readContext,
                    caps.writeContext,
                    caps.traverseGraph,
                    caps.receiveMessages,
                    caps.sendMessages,
                ],
            };
        case "writer":
            return {
                kind,
                role: roles.writer,
                capabilities: [
                    caps.readContext,
                    caps.writeContext,
                    caps.traverseGraph,
                    caps.receiveMessages,
                    caps.sendMessages,
                ],
            };
        case "reviewer":
            return {
                kind,
                role: roles.reviewer,
                capabilities: [
                    caps.readContext,
                    caps.writeContext,
                    caps.receiveMessages,
                ],
            };
    }
}

/** Creates all agent nodes for the collaboration graph */
export function createAgentNodes() {
    const roles = createCollaborationRoles();

    return {
        planner: createNode("agent:planner", roles.planner, { version: "1.0" }),
        researcher: createNode("agent:researcher", roles.researcher, {
            version: "1.0",
        }),
        writer: createNode("agent:writer", roles.writer, { version: "1.0" }),
        reviewer: createNode("agent:reviewer", roles.reviewer, {
            version: "1.0",
        }),
    };
}

/** Creates edges connecting agents in the workflow */
export function createAgentEdges() {
    return {
        plannerToResearcher: createEdge(
            "edge:planner-researcher",
            "agent:planner",
            "agent:researcher",
            "depends-on",
            { priority: 1 },
            false,
        ),
        researcherToWriter: createEdge(
            "edge:researcher-writer",
            "agent:researcher",
            "agent:writer",
            "depends-on",
            { priority: 1 },
            false,
        ),
        writerToReviewer: createEdge(
            "edge:writer-reviewer",
            "agent:writer",
            "agent:reviewer",
            "depends-on",
            { priority: 1 },
            false,
        ),
        reviewerToPlanner: createEdge(
            "edge:reviewer-planner",
            "agent:reviewer",
            "agent:planner",
            "notifies",
            { priority: 2 },
            false,
        ),
    };
}

/** Creates the complete collaboration graph */
export function createCollaborationGraph(): CollaborationGraph {
    const nodes = createAgentNodes();
    const edges = createAgentEdges();

    const nodeMap = new Map<string, GraphNode>([
        ["planner", nodes.planner],
        ["researcher", nodes.researcher],
        ["writer", nodes.writer],
        ["reviewer", nodes.reviewer],
    ]);

    const edgeMap = new Map<string, GraphEdge>([
        ["plannerToResearcher", edges.plannerToResearcher],
        ["researcherToWriter", edges.researcherToWriter],
        ["writerToReviewer", edges.writerToReviewer],
        ["reviewerToPlanner", edges.reviewerToPlanner],
    ]);

    return {
        nodes: nodeMap,
        edges: edgeMap,
    };
}

import type { GraphEdge, GraphNode } from "@graph-context-protocol/core";
