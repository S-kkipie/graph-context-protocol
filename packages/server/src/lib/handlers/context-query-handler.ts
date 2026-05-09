/**
 * Protocol handler for `context-query` messages.
 *
 * Validates the payload, authenticates the caller, resolves and authorizes
 * the target knowledge node, executes a targeted context query, and returns
 * a `context-query-response` protocol message. Never calls adapters on
 * denied queries. The requester descriptor in ContextQuery is audit-only
 * and never trusted for authorization.
 *
 * @module handlers/context-query-handler
 */

import {
    ContextQueryRequestSchema,
    createContextQueryResult,
    createMessageHeader,
    createProtocolMessage,
    succeed,
    type ContextQuery,
    type ContextQueryResult,
    type Graph,
    type GraphNode,
    type ProtocolMessage,
    type Result,
} from "@graph-context-protocol/core";
import type { Credentials, Principal } from "../auth/types.js";
import type { ServerError } from "../errors.js";
import type {
    HandlerContext,
    HandlerResult,
    ProtocolHandler,
} from "./types.js";

const METADATA_CREDENTIALS_KEY = "gcp.credentials" as const;
const METADATA_AUTH_KEY = "auth" as const;

function extractCredentials(
    context: HandlerContext,
    message: ProtocolMessage,
): Credentials | undefined {
    const raw =
        context.inboundMetadata[METADATA_CREDENTIALS_KEY] ??
        context.inboundMetadata[METADATA_AUTH_KEY];

    if (raw !== undefined) {
        return normalizeCredentials(raw);
    }

    const headerRaw =
        message.header.metadata[METADATA_CREDENTIALS_KEY] ??
        message.header.metadata[METADATA_AUTH_KEY];

    if (headerRaw !== undefined) {
        return normalizeCredentials(headerRaw);
    }

    return undefined;
}

function normalizeCredentials(raw: unknown): Credentials | undefined {
    if (
        typeof raw === "object" &&
        raw !== null &&
        "type" in raw &&
        "value" in raw &&
        typeof (raw as Record<string, unknown>).type === "string"
    ) {
        return raw as Credentials;
    }

    return undefined;
}

function resolveTargetNode(
    graph: Graph | undefined,
    targetNodeId: string,
): GraphNode | undefined {
    if (graph === undefined) {
        return undefined;
    }

    return graph.nodes.get(targetNodeId);
}

function buildResponseMessage(
    queryResult: ContextQueryResult,
    requestMessage: ProtocolMessage,
    localNodeId: string,
): ProtocolMessage {
    const responseHeader = createMessageHeader(
        `msg:${queryResult.queryId}:response`,
        localNodeId,
        requestMessage.header.source,
        "context-query-response",
        {
            correlationId: requestMessage.header.messageId,
            priority: requestMessage.header.priority,
            metadata: {
                queryId: queryResult.queryId,
                status: queryResult.status,
            },
        },
    );

    return createProtocolMessage(
        responseHeader,
        requestMessage.context,
        queryResult,
    );
}

function buildDeniedResponse(
    queryId: string,
    requestMessage: ProtocolMessage,
    localNodeId: string,
    reason: string,
): ProtocolMessage {
    const deniedResult = createContextQueryResult(
        queryId,
        "denied",
        localNodeId,
        { reason },
        undefined,
        reason,
    );

    return buildResponseMessage(deniedResult, requestMessage, localNodeId);
}

function buildNotFoundResponse(
    queryId: string,
    requestMessage: ProtocolMessage,
    localNodeId: string,
): ProtocolMessage {
    const notFoundResult = createContextQueryResult(
        queryId,
        "not-found",
        localNodeId,
        { reason: "Target node not found in graph" },
    );

    return buildResponseMessage(notFoundResult, requestMessage, localNodeId);
}

function buildErrorResponse(
    queryId: string,
    requestMessage: ProtocolMessage,
    localNodeId: string,
    error: string,
): ProtocolMessage {
    const errorResult = createContextQueryResult(
        queryId,
        "error",
        localNodeId,
        { reason: error },
        undefined,
        error,
    );

    return buildResponseMessage(errorResult, requestMessage, localNodeId);
}

/**
 * Creates a protocol handler for `context-query` messages.
 *
 * Requires a properly wired HandlerContext with `auth`, `graph`,
 * and `knowledgeSources` populated.
 *
 * @returns A ProtocolHandler for the `context-query` message type
 */
export function createContextQueryHandler(): ProtocolHandler {
    // Import node-authorization lazily to avoid circular deps between auth and handlers
    // For this to work at runtime, we import at call time.
    let authorizeAccess: typeof import("../auth/node-authorization.js").authorizeKnowledgeNodeAccess;
    let executeQuery: typeof import("../knowledge/context-query.js").executeTargetedContextQuery;

    return {
        name: "context-query-handler",
        messageTypes: ["context-query"],

        async handle(
            message: ProtocolMessage,
            context: HandlerContext,
        ): Promise<Result<HandlerResult, ServerError>> {
            const localNodeId = context.localNodeId;

            // 1. Validate payload
            const validationResult = ContextQueryRequestSchema.safeParse(
                message.payload,
            );

            if (!validationResult.success) {
                const errorMsg = `Invalid payload: ${validationResult.error.message}`;
                return succeed({
                    handled: true,
                    response: buildErrorResponse(
                        "unknown",
                        message,
                        localNodeId,
                        errorMsg,
                    ),
                    metadata: { error: errorMsg },
                });
            }

            const query: ContextQuery = validationResult.data;

            // 2. Authenticate caller
            const authProvider = context.auth;

            if (authProvider === undefined) {
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        "No auth provider configured",
                    ),
                    metadata: { denied: true },
                });
            }

            const credentials = extractCredentials(context, message);

            if (credentials === undefined) {
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        "No credentials provided",
                    ),
                    metadata: { denied: true },
                });
            }

            const authResult = await authProvider.authenticate(credentials);

            if (!authResult.success) {
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        `Authentication failed: ${authResult.error.message}`,
                    ),
                    metadata: { denied: true },
                });
            }

            const principal: Principal = authResult.data;

            // 3. Resolve target node from graph
            const targetNode = resolveTargetNode(
                context.graph,
                query.targetNodeId,
            );

            if (targetNode === undefined) {
                return succeed({
                    handled: true,
                    response: buildNotFoundResponse(
                        query.queryId,
                        message,
                        localNodeId,
                    ),
                    metadata: { notFound: true },
                });
            }

            // 4. Authorize target node access
            // Lazy-load to avoid import cycles
            if (!authorizeAccess) {
                const mod = await import("../auth/node-authorization.js");
                authorizeAccess = mod.authorizeKnowledgeNodeAccess;
            }

            const authzResult = authorizeAccess(
                principal,
                targetNode,
                authProvider,
                { action: "query-knowledge" },
            );

            if (!authzResult.success) {
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        `Authorization denied: ${authzResult.error.message}`,
                    ),
                    metadata: {
                        denied: true,
                        reason: authzResult.error.message,
                    },
                });
            }

            // 5. Execute targeted context query
            // Lazy-load to avoid import cycles
            if (!executeQuery) {
                const mod = await import("../knowledge/context-query.js");
                executeQuery = mod.executeTargetedContextQuery;
            }

            const queryResult = await executeQuery(
                query,
                principal,
                context.knowledgeSources,
                {
                    context: message.context,
                    sourceNodeId: query.targetNodeId,
                },
            );

            const responseMessage = buildResponseMessage(
                queryResult,
                message,
                localNodeId,
            );

            return succeed({
                handled: true,
                response: responseMessage,
                metadata: {
                    queryId: query.queryId,
                    status: queryResult.status,
                    targetNodeId: query.targetNodeId,
                },
            });
        },
    };
}
