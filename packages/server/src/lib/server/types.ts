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
} from "../types";

export type { ServerConfig } from "../types";

import type { ExternalAgentRegistry } from "../agents/types";
import type { AuditSink } from "../audit/types";
import type { AuthProvider } from "../auth/types";
import type { CacheStore } from "../cache/types";
import type { ConnectionManager } from "../connection/types";
import type { ServerError } from "../errors";
import type { HandlerRegistry } from "../handlers/types";
import type { KnowledgeSourceRegistry } from "../knowledge/types";
import type { LifecycleManager } from "../lifecycle/types";
import type { CouplingMetrics } from "../metrics/types";
import type { PeerRegistry } from "../peers/types";
import type { MessageRouter } from "../routing/types";
import type { SyncScheduler } from "../sync/types";
import type { TransportRegistry } from "../transport/types";

export interface ServerDependencies {
    readonly lifecycle: LifecycleManager;
    readonly transports: TransportRegistry;
    readonly connections: ConnectionManager;
    readonly auth: AuthProvider;
    readonly router: MessageRouter;
    readonly handlers: HandlerRegistry;
    readonly externalAgents: ExternalAgentRegistry;
    readonly knowledgeSources: KnowledgeSourceRegistry;
    readonly peers?: PeerRegistry;
    readonly cache?: CacheStore;
    readonly sync?: SyncScheduler;
    readonly graph?: Graph;
    readonly audit?: AuditSink;
    readonly metrics?: CouplingMetrics;
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
