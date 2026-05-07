/**
 * External knowledge source registry implementation.
 *
 * @module knowledge/implementation
 */

import type { Result } from "@graph-context-protocol/core";
import { fail, succeed } from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import { createServerError } from "../errors.js";
import type { KnowledgeSourceId } from "../types.js";
import type {
    KnowledgeCapability,
    KnowledgeQueryRequest,
    KnowledgeQueryResult,
    KnowledgeSourceAdapter,
    KnowledgeSourceQuery,
    KnowledgeSourceRegistry,
    KnowledgeSourceStatus,
} from "./types.js";

const QUERY_CAPABILITIES: readonly KnowledgeCapability[] = [
    "lookup",
    "search",
    "list",
];

/**
 * Creates an in-memory knowledge source registry.
 *
 * @returns Empty knowledge source registry
 */
export function createKnowledgeSourceRegistry(): KnowledgeSourceRegistry {
    return createRegistry(new Map(), new Map());
}

function createRegistry(
    adapters: ReadonlyMap<KnowledgeSourceId, KnowledgeSourceAdapter>,
    statuses: ReadonlyMap<KnowledgeSourceId, KnowledgeSourceStatus>,
): KnowledgeSourceRegistry {
    const adapterMap = new Map(adapters);
    const statusMap = new Map(statuses);

    return {
        register(adapter: KnowledgeSourceAdapter) {
            const validationError = validateAdapter(adapter);
            if (validationError !== undefined) {
                return fail(validationError);
            }

            if (adapterMap.has(adapter.id)) {
                return fail(
                    createServerError(
                        "conflict",
                        `Knowledge source is already registered: ${adapter.id}`,
                        { metadata: { sourceId: adapter.id } },
                    ),
                );
            }

            const nextAdapters = new Map(adapterMap);
            const nextStatuses = new Map(statusMap);
            nextAdapters.set(adapter.id, adapter);
            nextStatuses.set(adapter.id, "registered");

            return succeed(createRegistry(nextAdapters, nextStatuses));
        },

        get(id: KnowledgeSourceId) {
            return adapterMap.get(id);
        },

        list(query: KnowledgeSourceQuery = {}) {
            return Array.from(adapterMap.values()).filter((adapter) =>
                matchesQuery(adapter, query, statusMap),
            );
        },

        async query(request: KnowledgeQueryRequest) {
            const matchingAdapters = getMatchingQueryAdapters(
                adapterMap,
                request,
            );
            const results = await Promise.all(
                matchingAdapters.map((adapter) =>
                    queryAdapter(adapter, request),
                ),
            );
            const queryResults: KnowledgeQueryResult[] = [];

            for (const result of results) {
                if (!result.success) {
                    return fail(result.error);
                }

                queryResults.push(result.data);
            }

            return succeed(queryResults);
        },
    };
}

function validateAdapter(
    adapter: KnowledgeSourceAdapter,
): ServerError | undefined {
    if (adapter.id.length === 0) {
        return createServerError(
            "validation-error",
            "Knowledge source id is required",
        );
    }

    if (adapter.capabilities.length === 0) {
        return createServerError(
            "validation-error",
            "Knowledge source must declare at least one capability",
            { metadata: { sourceId: adapter.id } },
        );
    }

    const capabilities = new Set(adapter.capabilities);
    if (capabilities.size !== adapter.capabilities.length) {
        return createServerError(
            "validation-error",
            "Knowledge source capabilities must be unique",
            { metadata: { sourceId: adapter.id } },
        );
    }

    if (capabilities.has("sync") && adapter.sync === undefined) {
        return createServerError(
            "validation-error",
            "Knowledge source declares sync capability without sync implementation",
            { metadata: { sourceId: adapter.id } },
        );
    }

    return undefined;
}

function matchesQuery(
    adapter: KnowledgeSourceAdapter,
    query: KnowledgeSourceQuery,
    statuses: ReadonlyMap<KnowledgeSourceId, KnowledgeSourceStatus>,
): boolean {
    if (
        query.status !== undefined &&
        statuses.get(adapter.id) !== query.status
    ) {
        return false;
    }

    if (query.capabilities === undefined) {
        return true;
    }

    return query.capabilities.every((capability) =>
        adapter.capabilities.includes(capability),
    );
}

function getMatchingQueryAdapters(
    adapters: ReadonlyMap<KnowledgeSourceId, KnowledgeSourceAdapter>,
    request: KnowledgeQueryRequest,
): readonly KnowledgeSourceAdapter[] {
    const sourceFilter = request.query.filters?.sources;
    const sourceIds =
        sourceFilter === undefined ? undefined : new Set(sourceFilter);

    return Array.from(adapters.values()).filter((adapter) => {
        if (sourceIds !== undefined && !sourceIds.has(adapter.id)) {
            return false;
        }

        return QUERY_CAPABILITIES.some((capability) =>
            adapter.capabilities.includes(capability),
        );
    });
}

async function queryAdapter(
    adapter: KnowledgeSourceAdapter,
    request: KnowledgeQueryRequest,
): Promise<Result<KnowledgeQueryResult, ServerError>> {
    try {
        const result = await adapter.query(request);

        if (!result.success) {
            return fail(withSourceMetadata(adapter.id, result.error));
        }

        if (result.data.sourceId !== adapter.id) {
            return fail(
                createServerError(
                    "knowledge-error",
                    "Knowledge source returned a result for a different source",
                    {
                        metadata: {
                            sourceId: adapter.id,
                            resultSourceId: result.data.sourceId,
                        },
                    },
                ),
            );
        }

        return succeed({
            ...result.data,
            metadata: {
                ...result.data.metadata,
                sourceId: adapter.id,
            },
        });
    } catch (cause) {
        return fail(
            createServerError(
                "knowledge-error",
                `Knowledge source query failed: ${adapter.id}`,
                { cause, metadata: { sourceId: adapter.id } },
            ),
        );
    }
}

function withSourceMetadata(
    sourceId: KnowledgeSourceId,
    error: ServerError,
): ServerError {
    return createServerError(error.code, error.message, {
        cause: error.cause,
        metadata: {
            ...error.metadata,
            sourceId,
        },
    });
}
