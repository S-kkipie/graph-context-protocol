// Base types and utilities

// External agents
export { createExternalAgentRegistry } from "./lib/agents/index.js";
export type {
    ExternalAgentDescriptor,
    ExternalAgentQuery,
    ExternalAgentRegistry,
    ExternalAgentSnapshot,
    ExternalAgentStatus,
} from "./lib/agents/types.js";
export type {
    AuthAction,
    AuthorizationDecision,
    AuthorizationRequest,
    AuthProvider,
    Credentials,
    NodeAuthorizationOptions,
    Principal,
} from "./lib/auth/index.js";
// Authentication
export {
    authorizeKnowledgeNodeAccess,
    createAllowAllAuthProvider,
    createCapabilityAuthProvider,
    createStaticTokenAuthProvider,
} from "./lib/auth/index.js";
// Cache
export { createMemoryCacheStore } from "./lib/cache/index.js";
export type {
    CacheEntry,
    CacheOptions,
    CacheStore,
} from "./lib/cache/types.js";
// Connection management
export { createConnectionManager } from "./lib/connection/index.js";
export type {
    Connection,
    ConnectionManager,
    ConnectionQuery,
    ConnectionSnapshot,
    ConnectionStatus,
    OpenConnectionInput,
    Session,
} from "./lib/connection/types.js";
export type { ServerError, ServerErrorCode } from "./lib/errors.js";
export { createServerError, ServerErrorClass } from "./lib/errors.js";
// Protocol handlers
export {
    createContextQueryHandler,
    createHandlerRegistry,
} from "./lib/handlers/index.js";
export type {
    HandlerContext,
    HandlerRegistry,
    HandlerResult,
    ProtocolHandler,
} from "./lib/handlers/types.js";
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
} from "./lib/knowledge/index.js";
// Knowledge sources
export {
    createKnowledgeSourceRegistry,
    executeTargetedContextQuery,
} from "./lib/knowledge/index.js";
// Lifecycle management
export { createLifecycleManager } from "./lib/lifecycle/index.js";
export type {
    LifecycleContext,
    LifecycleHook,
    LifecycleManager,
    LifecyclePhase,
    LifecycleSnapshot,
    ShutdownOptions,
} from "./lib/lifecycle/types.js";
// Message routing
export { createMessageRouter } from "./lib/routing/index.js";
export type {
    MessageRoute,
    MessageRouter,
    RouteKind,
    RoutingContext,
} from "./lib/routing/types.js";
// Server runtime
export { createGraphContextServer } from "./lib/server/index.js";
export type {
    GraphContextServer,
    ServerDependencies,
    ServerSnapshot,
} from "./lib/server/types.js";
// Sync scheduler
export { createSyncScheduler } from "./lib/sync/index.js";
export type {
    SyncOperation,
    SyncRequest,
    SyncResult,
    SyncScheduler,
    SyncStatus,
} from "./lib/sync/types.js";
// Transport abstraction
export {
    createMemoryTransport,
    createTransportRegistry,
} from "./lib/transport/index.js";
export type {
    Transport,
    TransportEnvelope,
    TransportMessageListener,
    TransportRegistry,
    TransportSnapshot,
    TransportStatus,
} from "./lib/transport/types.js";
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
} from "./lib/types.js";
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
} from "./lib/types.js";

// Re-export zod for consumers
import { z } from "zod";

export { z };
