import type { ProtocolMessage, NodeId } from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import type { Result } from "@graph-context-protocol/core";
import type { ConnectionManager } from "../connection/types.js";
import type { ExternalAgentRegistry } from "../agents/types.js";
import type { KnowledgeSourceRegistry } from "../knowledge/types.js";

export type RouteKind =
    | "local-handler"
    | "external-agent"
    | "knowledge-source"
    | "broadcast"
    | "undeliverable";

export interface MessageRoute {
    readonly kind: RouteKind;
    readonly message: ProtocolMessage;
    readonly targetNodeId: NodeId;
    readonly connectionId?: string;
    readonly transportId?: string;
    readonly externalAgentId?: string;
    readonly knowledgeSourceId?: string;
    readonly metadata: Record<string, unknown>;
}

export interface RoutingContext {
    readonly localNodeId: NodeId;
    readonly connections: ConnectionManager;
    readonly externalAgents: ExternalAgentRegistry;
    readonly knowledgeSources: KnowledgeSourceRegistry;
}

export interface MessageRouter {
    route(
        message: ProtocolMessage,
        context: RoutingContext,
    ): Result<MessageRoute, ServerError>;
}
