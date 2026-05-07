/**
 * External knowledge source registry types.
 *
 * @module knowledge/types
 */

import type {
    DiscoveryQuery,
    GraphContext,
    KnowledgeNode,
    Metadata,
    NodeId,
    Result,
    Timestamp,
} from "@graph-context-protocol/core";
import type { Principal } from "../auth/types.js";
import type { ServerError } from "../errors.js";
import type { KnowledgeSourceId } from "../types.js";

/**
 * External knowledge source lifecycle status.
 */
export type KnowledgeSourceStatus =
    | "registered"
    | "available"
    | "syncing"
    | "stale"
    | "unavailable"
    | "failed";

/**
 * Capabilities supported by a knowledge source adapter.
 */
export type KnowledgeCapability =
    | "lookup"
    | "search"
    | "list"
    | "sync"
    | "subscribe";

/**
 * Request passed to knowledge source query adapters.
 */
export interface KnowledgeQueryRequest {
    readonly requester: Principal;
    readonly query: DiscoveryQuery;
    readonly context?: GraphContext;
    readonly metadata: Metadata;
}

/**
 * Result returned by one knowledge source adapter.
 */
export interface KnowledgeQueryResult {
    readonly sourceId: KnowledgeSourceId;
    readonly nodes: readonly KnowledgeNode[];
    readonly raw?: unknown;
    readonly metadata: Metadata;
}

/**
 * Adapter for an external knowledge source.
 */
export interface KnowledgeSourceAdapter {
    readonly id: KnowledgeSourceId;
    readonly capabilities: readonly KnowledgeCapability[];
    query(
        request: KnowledgeQueryRequest,
    ): Promise<Result<KnowledgeQueryResult, ServerError>>;
    get?(
        nodeId: NodeId,
    ): Promise<Result<KnowledgeNode | undefined, ServerError>>;
    sync?(request: SyncRequest): Promise<Result<SyncResult, ServerError>>;
    health?(): Promise<Result<KnowledgeSourceHealth, ServerError>>;
}

/**
 * Health state returned by a knowledge source adapter.
 */
export interface KnowledgeSourceHealth {
    readonly healthy: boolean;
    readonly lastCheckedAt: Timestamp;
    readonly message?: string;
}

/**
 * Filters for listing registered knowledge source adapters.
 */
export interface KnowledgeSourceQuery {
    readonly capabilities?: readonly KnowledgeCapability[];
    readonly status?: KnowledgeSourceStatus;
}

/**
 * Registry of external knowledge source adapters.
 */
export interface KnowledgeSourceRegistry {
    register(
        adapter: KnowledgeSourceAdapter,
    ): Result<KnowledgeSourceRegistry, ServerError>;
    get(id: KnowledgeSourceId): KnowledgeSourceAdapter | undefined;
    list(query?: KnowledgeSourceQuery): readonly KnowledgeSourceAdapter[];
    query(
        request: KnowledgeQueryRequest,
    ): Promise<Result<readonly KnowledgeQueryResult[], ServerError>>;
}

import type {
    SyncRequest as SyncRequestType,
    SyncResult as SyncResultType,
} from "../sync/types.js";
export type SyncRequest = SyncRequestType;
export type SyncResult = SyncResultType;
