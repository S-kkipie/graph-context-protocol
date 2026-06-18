// Base types and utilities

// External agents
export { createExternalAgentRegistry } from "./lib/agents/index";
export type {
    ExternalAgentDescriptor,
    ExternalAgentQuery,
    ExternalAgentRegistry,
    ExternalAgentSnapshot,
    ExternalAgentStatus,
} from "./lib/agents/types";
export type { AuditSink } from "./lib/audit/index";
// Audit
export { createInMemoryAuditSink } from "./lib/audit/index";
export type {
    AuthAction,
    AuthorizationDecision,
    AuthorizationRequest,
    AuthProvider,
    Credentials,
    NodeAuthorizationGrant,
    NodeAuthorizationOptions,
    Principal,
} from "./lib/auth/index";
// Authentication
export {
    authorizeKnowledgeNodeAccess,
    createAllowAllAuthProvider,
    createCapabilityAuthProvider,
    createStaticTokenAuthProvider,
} from "./lib/auth/index";
// Cache
export { createMemoryCacheStore } from "./lib/cache/index";
export type {
    CacheEntry,
    CacheOptions,
    CacheStore,
} from "./lib/cache/types";
// Connection management
export { createConnectionManager } from "./lib/connection/index";
export type {
    Connection,
    ConnectionManager,
    ConnectionQuery,
    ConnectionSnapshot,
    ConnectionStatus,
    OpenConnectionInput,
    Session,
} from "./lib/connection/types";
export type { ServerError, ServerErrorCode } from "./lib/errors";
export { createServerError, ServerErrorClass } from "./lib/errors";
// Protocol handlers
export {
    createContextQueryHandler,
    createHandlerRegistry,
} from "./lib/handlers/index";
export type {
    HandlerContext,
    HandlerRegistry,
    HandlerResult,
    ProtocolHandler,
} from "./lib/handlers/types";
export type { QueryRemoteContextOptions } from "./lib/http/fetch-client";
export { queryRemoteContext } from "./lib/http/fetch-client";
export type { FetchHandlerOptions } from "./lib/http/fetch-handler";
// HTTP helpers
export { createFetchHandler } from "./lib/http/fetch-handler";
export { postProtocolMessage } from "./lib/http/post-message";
export type {
    KnowledgeCapability,
    KnowledgeQueryRequest,
    KnowledgeQueryResult,
    KnowledgeSourceAdapter,
    KnowledgeSourceHealth,
    KnowledgeSourceQuery,
    KnowledgeSourceRegistry,
    KnowledgeSourceStatus,
    TargetedQueryOptions,
} from "./lib/knowledge/index";
// Knowledge sources
export {
    createKnowledgeSourceRegistry,
    executeTargetedContextQuery,
} from "./lib/knowledge/index";
// Lifecycle management
export { createLifecycleManager } from "./lib/lifecycle/index";
export type {
    LifecycleContext,
    LifecycleHook,
    LifecycleManager,
    LifecyclePhase,
    LifecycleSnapshot,
    ShutdownOptions,
} from "./lib/lifecycle/types";
// Message routing
export { createMessageRouter } from "./lib/routing/index";
export type {
    MessageRoute,
    MessageRouter,
    RouteKind,
    RoutingContext,
} from "./lib/routing/types";
// Server runtime
export { createGraphContextServer } from "./lib/server/index";
export type {
    GraphContextServer,
    ServerDependencies,
    ServerSnapshot,
} from "./lib/server/types";
// Sync scheduler
export { createSyncScheduler } from "./lib/sync/index";
export type {
    SyncOperation,
    SyncRequest,
    SyncResult,
    SyncScheduler,
    SyncStatus,
} from "./lib/sync/types";
export type { HttpTransportOptions } from "./lib/transport/index";
// Transport abstraction
export {
    createHttpTransport,
    createMemoryTransport,
    createTransportRegistry,
} from "./lib/transport/index";
export type {
    Transport,
    TransportEnvelope,
    TransportMessageListener,
    TransportRegistry,
    TransportSnapshot,
    TransportStatus,
} from "./lib/transport/types";
export type {
    ConnectionId,
    DeliveryReceipt,
    ExternalAgentId,
    InboundMessageEnvelope,
    KnowledgeSourceId,
    OutboundMessageEnvelope,
    ServerConfig,
    ServerId,
    ServerStatus,
    SessionId,
    TransportId,
    Unsubscribe,
} from "./lib/types";
export {
    ConnectionIdSchema,
    DeliveryReceiptSchema,
    ExternalAgentIdSchema,
    KnowledgeSourceIdSchema,
    ServerConfigSchema,
    ServerIdSchema,
    ServerStatusSchema,
    SessionIdSchema,
    TransportIdSchema,
} from "./lib/types";

// Re-export zod for consumers
import { z } from "zod";

export { z };
