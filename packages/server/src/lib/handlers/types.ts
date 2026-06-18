import type {
    Graph,
    Metadata,
    ProtocolMessage,
    Result,
} from "@graph-context-protocol/core";
import type { ExternalAgentRegistry } from "../agents/types";
import type { AuditSink } from "../audit/types";
import type { AuthProvider } from "../auth/types";
import type { CacheStore } from "../cache/types";
import type { ConnectionManager } from "../connection/types";
import type { ServerError } from "../errors";
import type { KnowledgeSourceRegistry } from "../knowledge/types";
import type { ServerId } from "../types";

export interface HandlerContext {
    readonly serverId: ServerId;
    readonly localNodeId: string;
    readonly graph?: Graph;
    readonly connections: ConnectionManager;
    readonly externalAgents: ExternalAgentRegistry;
    readonly knowledgeSources: KnowledgeSourceRegistry;
    readonly cache?: CacheStore;
    /** Auth provider for per-handler authentication and authorization. */
    readonly auth?: AuthProvider;
    /** Audit sink for recording context-read decisions. */
    readonly audit?: AuditSink;
    /** Inbound envelope metadata propagated to handlers. */
    readonly inboundMetadata: Metadata;
    readonly metadata: Record<string, unknown>;
}

export interface HandlerResult {
    readonly handled: boolean;
    readonly response?: ProtocolMessage;
    readonly notifications?: readonly ProtocolMessage[];
    readonly metadata: Record<string, unknown>;
}

export interface ProtocolHandler {
    readonly name: string;
    readonly messageTypes: readonly string[];
    handle(
        message: ProtocolMessage,
        context: HandlerContext,
    ): Promise<Result<HandlerResult, ServerError>>;
}

export interface HandlerRegistry {
    register(handler: ProtocolHandler): Result<HandlerRegistry, ServerError>;
    get(messageType: string): readonly ProtocolHandler[];
    dispatch(
        message: ProtocolMessage,
        context: HandlerContext,
    ): Promise<Result<HandlerResult, ServerError>>;
}
