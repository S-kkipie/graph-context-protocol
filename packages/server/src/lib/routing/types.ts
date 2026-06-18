import type {
    NodeId,
    ProtocolMessage,
    Result,
} from "@graph-context-protocol/core";
import type { ExternalAgentRegistry } from "../agents/types";
import type { ConnectionManager } from "../connection/types";
import type { ServerError } from "../errors";
import type { KnowledgeSourceRegistry } from "../knowledge/types";
import type { PeerRegistry } from "../peers/types";

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
    readonly peers?: PeerRegistry;
}

export interface MessageRouter {
    route(
        message: ProtocolMessage,
        context: RoutingContext,
    ): Result<MessageRoute, ServerError>;
}
