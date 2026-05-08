import type {
    Graph,
    NodeId,
    ProtocolMessage,
    Result,
    Timestamp,
} from "@graph-context-protocol/core";
import type {
    DeliveryReceipt,
    InboundMessageEnvelope,
    ServerId,
    ServerStatus,
} from "../types.js";

export type { ServerConfig } from "../types.js";

import type { ExternalAgentRegistry } from "../agents/types.js";
import type { AuthProvider } from "../auth/types.js";
import type { CacheStore } from "../cache/types.js";
import type { ConnectionManager } from "../connection/types.js";
import type { ServerError } from "../errors.js";
import type { HandlerRegistry } from "../handlers/types.js";
import type { KnowledgeSourceRegistry } from "../knowledge/types.js";
import type { LifecycleManager } from "../lifecycle/types.js";
import type { MessageRouter } from "../routing/types.js";
import type { SyncScheduler } from "../sync/types.js";
import type { TransportRegistry } from "../transport/types.js";

export interface ServerDependencies {
    readonly lifecycle: LifecycleManager;
    readonly transports: TransportRegistry;
    readonly connections: ConnectionManager;
    readonly auth: AuthProvider;
    readonly router: MessageRouter;
    readonly handlers: HandlerRegistry;
    readonly externalAgents: ExternalAgentRegistry;
    readonly knowledgeSources: KnowledgeSourceRegistry;
    readonly cache?: CacheStore;
    readonly sync?: SyncScheduler;
    readonly graph?: Graph;
}

export interface ServerSnapshot {
    readonly id: ServerId;
    readonly status: ServerStatus;
    readonly localNodeId: NodeId;
    readonly startedAt?: Timestamp;
    readonly stoppedAt?: Timestamp;
    readonly activeConnections: number;
    readonly activeSessions: number;
    readonly transports: readonly string[];
}

export interface GraphContextServer {
    readonly id: ServerId;
    readonly status: ServerStatus;
    readonly localNodeId: NodeId;
    start(): Promise<Result<ServerSnapshot, ServerError>>;
    stop(): Promise<Result<ServerSnapshot, ServerError>>;
    send(
        message: ProtocolMessage,
    ): Promise<Result<DeliveryReceipt, ServerError>>;
    receive(
        envelope: InboundMessageEnvelope,
    ): Promise<Result<unknown, ServerError>>;
    snapshot(): ServerSnapshot;
}
