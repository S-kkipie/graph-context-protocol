import { z } from "zod";
import type { Metadata, NodeId } from "../types";
import { CapabilityIdSchema, MetadataSchema, NodeIdSchema } from "../types";
import type {
    ContextQueryContractVersion,
    ContextQueryRequest,
    ContextQueryResponse,
    ContextQueryStatus,
    ContextReadProvenance,
    QueryMode,
    RequesterDescriptor,
} from "./context-query-types";

/**
 * Remote context query factory functions with Zod validation.
 *
 * @module context/context-query-factories
 */

/**
 * Zod schema for ContextQueryContractVersion validation.
 */
export const ContextQueryContractVersionSchema = z.literal(
    "gcp-context-contract/v1",
);

/**
 * Zod schema for QueryMode validation.
 */
export const QueryModeSchema = z.enum([
    "text",
    "semantic",
    "structured",
    "hybrid",
]);

/**
 * Zod schema for ContextQueryStatus validation.
 */
export const ContextQueryStatusSchema = z.enum([
    "ok",
    "denied",
    "not-found",
    "invalid-query",
    "unavailable",
    "error",
]);

/**
 * Zod schema for RequesterDescriptor validation.
 */
export const RequesterDescriptorSchema = z.object({
    principalId: z.string().min(1),
    roles: z.array(z.string()),
    capabilities: z.array(CapabilityIdSchema),
    metadata: MetadataSchema,
});

/**
 * Zod schema for ContextQueryRequest validation.
 */
export const ContextQueryRequestSchema = z.object({
    contractVersion: ContextQueryContractVersionSchema,
    queryId: z.string().min(1),
    requester: RequesterDescriptorSchema,
    targetNodeId: NodeIdSchema,
    mode: QueryModeSchema,
    query: z.union([z.string(), z.record(z.string(), z.unknown())]),
    filters: z.record(z.string(), z.unknown()).optional(),
    metadata: MetadataSchema,
});

/**
 * Zod schema for ContextQueryResponse validation.
 */
export const ContextQueryResponseSchema = z.object({
    contractVersion: ContextQueryContractVersionSchema,
    queryId: z.string().min(1),
    status: ContextQueryStatusSchema,
    sourceNodeId: NodeIdSchema,
    result: z.unknown().optional(),
    error: z.string().optional(),
    provenance: z.record(z.string(), z.unknown()).optional(),
    metadata: MetadataSchema,
});

/**
 * Creates a requester descriptor.
 *
 * @param principalId - Unique identifier for the principal
 * @param roles - Roles assigned to the principal
 * @param capabilities - Capabilities granted to the principal
 * @param metadata - Optional metadata
 * @returns A new RequesterDescriptor instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createRequesterDescriptor(
    principalId: string,
    roles: readonly string[] = [],
    capabilities: readonly string[] = [],
    metadata: Metadata = {},
): RequesterDescriptor {
    const input = RequesterDescriptorSchema.parse({
        principalId,
        roles,
        capabilities,
        metadata,
    });

    return {
        principalId: input.principalId,
        roles: input.roles,
        capabilities: input.capabilities,
        metadata: input.metadata,
    };
}

/**
 * Creates a context query request.
 *
 * @param queryId - Unique identifier for the query
 * @param requester - Descriptor of the entity making the request
 * @param targetNodeId - ID of the target node to query
 * @param mode - Query mode
 * @param query - Query content (text or structured)
 * @param metadata - Optional metadata
 * @param filters - Optional filters
 * @returns A new ContextQueryRequest instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createContextQuery(
    queryId: string,
    requester: RequesterDescriptor,
    targetNodeId: NodeId,
    mode: QueryMode,
    query: string | Record<string, unknown>,
    metadata: Metadata = {},
    filters?: Record<string, unknown>,
): ContextQueryRequest {
    const input = ContextQueryRequestSchema.parse({
        contractVersion:
            "gcp-context-contract/v1" as ContextQueryContractVersion,
        queryId,
        requester,
        targetNodeId,
        mode,
        query,
        metadata,
        filters,
    });

    return {
        contractVersion: input.contractVersion,
        queryId: input.queryId,
        requester: input.requester,
        targetNodeId: input.targetNodeId,
        mode: input.mode,
        query: input.query,
        metadata: input.metadata,
        filters: input.filters,
    };
}

/**
 * Creates a context query response.
 *
 * @param queryId - Unique identifier for the query
 * @param status - Response status
 * @param sourceNodeId - ID of the node responding
 * @param metadata - Optional metadata
 * @param result - Optional result data
 * @param error - Optional error message
 * @param provenance - Optional provenance entries
 * @returns A new ContextQueryResponse instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createContextQueryResult(
    queryId: string,
    status: ContextQueryStatus,
    sourceNodeId: NodeId,
    metadata: Metadata = {},
    result?: unknown,
    error?: string,
    provenance?: ContextReadProvenance,
): ContextQueryResponse {
    const input = ContextQueryResponseSchema.parse({
        contractVersion:
            "gcp-context-contract/v1" as ContextQueryContractVersion,
        queryId,
        status,
        sourceNodeId,
        metadata,
        result,
        error,
        provenance,
    });

    return {
        contractVersion: input.contractVersion,
        queryId: input.queryId,
        status: input.status,
        sourceNodeId: input.sourceNodeId,
        metadata: input.metadata,
        result: input.result,
        error: input.error,
        provenance: provenance,
    };
}
