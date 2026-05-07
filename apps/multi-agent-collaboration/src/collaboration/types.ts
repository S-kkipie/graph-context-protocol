/**
 * Types for the multi-agent collaboration demo.
 * @module collaboration/types
 */

import type {
    Capability,
    ContextId,
    GraphContext,
    GraphEdge,
    GraphNode,
    ProtocolMessage,
    RoleDefinition,
} from "@graph-context-protocol/core";

/** Agent types in the collaboration workflow */
export type AgentKind = "planner" | "researcher" | "writer" | "reviewer";

/** Represents the collaboration graph structure */
export interface CollaborationGraph {
    readonly nodes: ReadonlyMap<string, GraphNode>;
    readonly edges: ReadonlyMap<string, GraphEdge>;
}

/** Agent configuration with role and capabilities */
export interface AgentConfig {
    readonly kind: AgentKind;
    readonly role: RoleDefinition;
    readonly capabilities: readonly Capability[];
}

/** Valid edge types from the core library */
export type EdgeType =
    | "can-access"
    | "can-modify"
    | "can-traverse"
    | "depends-on"
    | "notifies"
    | "custom";

/** A single step in the collaboration workflow */
export interface CollaborationStep {
    readonly from: AgentKind;
    readonly to: AgentKind;
    readonly edgeType: EdgeType;
    readonly contextKeys: readonly string[];
    readonly filters?: readonly string[];
}

/** Result of a context propagation attempt */
export interface PropagationAttempt {
    readonly success: boolean;
    readonly from: AgentKind;
    readonly to: AgentKind;
    readonly contextId: ContextId;
    readonly filteredData: Record<string, unknown>;
    readonly excludedKeys: readonly string[];
}

/** A message trace entry showing provenance */
export interface MessageTraceEntry {
    readonly messageId: string;
    readonly from: AgentKind;
    readonly to: AgentKind;
    readonly timestamp: string;
    readonly provenance: readonly string[];
}

/** Complete scenario result */
export interface ScenarioResult {
    readonly graph: CollaborationGraph;
    readonly steps: readonly CollaborationStep[];
    readonly propagations: readonly PropagationAttempt[];
    readonly messages: readonly ProtocolMessage[];
    readonly traces: readonly MessageTraceEntry[];
    readonly finalContext: GraphContext | null;
    readonly startTime: string;
    readonly endTime: string;
}

/** Report output format */
export interface ReportOutput {
    readonly title: string;
    readonly summary: string;
    readonly agentGraph: string;
    readonly contextFlow: string;
    readonly provenanceTrace: string;
    readonly finalState: string;
}
