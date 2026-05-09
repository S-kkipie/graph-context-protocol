import type { CapabilityId, Metadata, NodeId } from "../types";

/**
 * Remote context query contract types.
 *
 * @module context/context-query-types
 */

/**
 * Literal contract version for context query contracts.
 */
export type ContextQueryContractVersion = "gcp-context-contract/v1";

/**
 * Query modes supported by the context query system.
 */
export type QueryMode = "text" | "semantic" | "structured" | "hybrid";

/**
 * Status values for a context query response.
 */
export type ContextQueryStatus =
    | "ok"
    | "denied"
    | "not-found"
    | "invalid-query"
    | "unavailable"
    | "error";

/**
 * Describes the requester of a context query for audit metadata.
 * This is audit metadata, not trusted authentication.
 */
export interface RequesterDescriptor {
    readonly principalId: string;
    readonly roles: readonly string[];
    readonly capabilities: readonly CapabilityId[];
    readonly metadata: Metadata;
}

/**
 * A context query request sent to a remote node.
 */
export interface ContextQueryRequest {
    readonly contractVersion: ContextQueryContractVersion;
    readonly queryId: string;
    readonly requester: RequesterDescriptor;
    readonly targetNodeId: NodeId;
    readonly mode: QueryMode;
    readonly query: string | Record<string, unknown>;
    readonly filters?: Record<string, unknown>;
    readonly metadata: Metadata;
}

/**
 * Alias for ContextQueryRequest.
 */
export type ContextQuery = ContextQueryRequest;

/**
 * A context query response returned from a remote node.
 */
export interface ContextQueryResponse {
    readonly contractVersion: ContextQueryContractVersion;
    readonly queryId: string;
    readonly status: ContextQueryStatus;
    readonly sourceNodeId: NodeId;
    readonly result?: unknown;
    readonly error?: string;
    readonly provenance?: Record<string, unknown>;
    readonly metadata: Metadata;
}

/**
 * Alias for ContextQueryResponse.
 */
export type ContextQueryResult = ContextQueryResponse;
