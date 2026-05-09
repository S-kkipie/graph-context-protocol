/**
 * Targeted context query execution against a single knowledge source adapter.
 *
 * Resolves exactly one adapter by target node/source mapping, translates
 * the adapter result into a core ContextQueryResult, and preserves
 * queryId / sourceNodeId / result / provenance / source-of-truth metadata.
 * Never fans out to multiple adapters.
 *
 * @module knowledge/context-query
 */

import {
    type ContextQuery,
    type ContextQueryResult,
    type ContextQueryStatus,
    createContextQueryResult,
    type GraphContext,
    type Metadata,
    type Result,
} from "@graph-context-protocol/core";
import type { Principal } from "../auth/types.js";
import type { ServerError } from "../errors.js";
import type {
    KnowledgeQueryRequest,
    KnowledgeQueryResult,
    KnowledgeSourceRegistry,
} from "./types.js";

/**
 * Options for executing a targeted context query.
 */
export interface TargetedQueryOptions {
    /** Optional graph context for the query. */
    readonly context?: GraphContext;
    /** Extra metadata attached to the query result. */
    readonly metadata?: Metadata;
    /** Source node ID overriding the targetNodeId. */
    readonly sourceNodeId?: string;
}

/**
 * Executes a targeted context query against the single knowledge source
 * adapter whose id matches the query's targetNodeId.
 *
 * @param query - The validated context query from the protocol layer
 * @param principal - The authenticated principal
 * @param registry - The knowledge source registry containing adapters
 * @param options - Optional graph context and metadata
 * @returns A core ContextQueryResult with status, result, provenance
 *
 * @example
 * ```typescript
 * const result = await executeTargetedContextQuery(
 *     contextQuery,
 *     principal,
 *     knowledgeSourceRegistry,
 *     { context: graphContext },
 * );
 * // result.status is "ok", "not-found", "unavailable", or "error"
 * ```
 */
export async function executeTargetedContextQuery(
    query: ContextQuery,
    principal: Principal,
    registry: KnowledgeSourceRegistry,
    options: TargetedQueryOptions = {},
): Promise<ContextQueryResult> {
    const sourceNodeId = options.sourceNodeId ?? query.targetNodeId;

    // 1. Resolve exactly one adapter by matching adapter.id to targetNodeId
    const adapter = registry.get(query.targetNodeId);

    if (adapter === undefined) {
        return createContextQueryResult(
            query.queryId,
            "not-found",
            sourceNodeId,
            withSourceMetadata(query.metadata, options.metadata, {
                targetNodeId: query.targetNodeId,
                reason: "No knowledge source adapter registered for target node",
            }),
        );
    }

    // 2. Build a KnowledgeQueryRequest from the context query
    const knowledgeRequest: KnowledgeQueryRequest = {
        requester: principal,
        query: {
            kinds: ["knowledge"],
            filters: {
                sources: [adapter.id],
                ...(query.filters as Record<string, unknown> | undefined),
            },
        },
        contextQuery: query,
        context: options.context,
        metadata: query.metadata,
    };

    // 3. Execute adapter query
    let adapterResult: Result<KnowledgeQueryResult, ServerError>;

    try {
        adapterResult = await adapter.query(knowledgeRequest);
    } catch (cause) {
        return createContextQueryResult(
            query.queryId,
            "error",
            sourceNodeId,
            withSourceMetadata(query.metadata, options.metadata, {
                targetNodeId: query.targetNodeId,
                error: `Adapter query threw an unexpected error`,
            }),
            undefined,
            `Knowledge source query failed: ${adapter.id}`,
            {
                sourceId: adapter.id,
                queryId: query.queryId,
            },
        );
    }

    // 4. Translate adapter result to ContextQueryResult
    if (!adapterResult.success) {
        const status = mapErrorToStatus(adapterResult.error);
        return createContextQueryResult(
            query.queryId,
            status,
            sourceNodeId,
            withSourceMetadata(query.metadata, options.metadata, {
                targetNodeId: query.targetNodeId,
                sourceId: adapter.id,
                errorCode: adapterResult.error.code,
                errorMessage: adapterResult.error.message,
            }),
            undefined,
            adapterResult.error.message,
            {
                sourceId: adapter.id,
                queryId: query.queryId,
            },
        );
    }

    const knowledgeResult = adapterResult.data;

    return createContextQueryResult(
        query.queryId,
        "ok",
        sourceNodeId,
        withSourceMetadata(query.metadata, options.metadata, {
            targetNodeId: query.targetNodeId,
            sourceId: adapter.id,
            nodeCount: knowledgeResult.nodes.length,
        }),
        knowledgeResult.raw ?? knowledgeResult.nodes,
        undefined,
        {
            sourceId: adapter.id,
            sourceOfTruth: knowledgeResult.metadata.sourceOfTruth,
            queryId: query.queryId,
        },
    );
}

function mapErrorToStatus(error: ServerError): ContextQueryStatus {
    if (error.code === "not-found") {
        return "not-found";
    }

    if (
        error.code === "timeout" ||
        error.code === "transport-error" ||
        error.code === "connection-error"
    ) {
        return "unavailable";
    }

    return "error";
}

function withSourceMetadata(
    base: Metadata,
    extra?: Metadata,
    overrides?: Metadata,
): Metadata {
    return { ...base, ...extra, ...overrides };
}
