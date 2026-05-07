import type {
    ProtocolMessage,
    Graph,
    Result,
} from "@graph-context-protocol/core";
import type { ServerId } from "../types.js";
import type { ServerError } from "../errors.js";
import type { ConnectionManager } from "../connection/types.js";
import type { ExternalAgentRegistry } from "../agents/types.js";
import type { KnowledgeSourceRegistry } from "../knowledge/types.js";
import type { CacheStore } from "../cache/types.js";

export interface HandlerContext {
    readonly serverId: ServerId;
    readonly localNodeId: string;
    readonly graph?: Graph;
    readonly connections: ConnectionManager;
    readonly externalAgents: ExternalAgentRegistry;
    readonly knowledgeSources: KnowledgeSourceRegistry;
    readonly cache?: CacheStore;
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
