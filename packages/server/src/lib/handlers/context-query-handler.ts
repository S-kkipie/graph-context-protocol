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
    type ContextQuery,
    ContextQueryRequestSchema,
    type ContextQueryResult,
    type ContextReadProvenance,
    createContextQueryResult,
    createMessageHeader,
    createProtocolMessage,
    createReadProvenance,
    type Graph,
    type GraphNode,
    type ProtocolMessage,
    type Result,
    succeed,
} from "@graph-context-protocol/core";
import type { Principal } from "../auth/types";
import type { ServerError } from "../errors";
import { extractCredentials } from "./extract-credentials";
import type { HandlerContext, HandlerResult, ProtocolHandler } from "./types";

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
    provenance?: ContextReadProvenance,
): ProtocolMessage {
    const deniedResult = createContextQueryResult(
        queryId,
        "denied",
        localNodeId,
        { reason },
        undefined,
        reason,
        provenance,
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
    let authorizeAccess: typeof import("../auth/node-authorization").authorizeKnowledgeNodeAccess;
    let executeQuery: typeof import("../knowledge/context-query").executeTargetedContextQuery;

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

            const recordDeny = async (
                principalId: string,
                reason: string,
            ): Promise<ContextReadProvenance> => {
                const provenance = createReadProvenance(
                    principalId,
                    query.targetNodeId,
                    query.queryId,
                    new Date().toISOString(),
                    "deny",
                    { reason },
                );
                await context.audit?.record(provenance);
                return provenance as ContextReadProvenance;
            };

            // 2. Authenticate caller
            const authProvider = context.auth;

            if (authProvider === undefined) {
                const provenance = await recordDeny(
                    query.requester.principalId,
                    "No auth provider configured",
                );
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        "No auth provider configured",
                        provenance,
                    ),
                    metadata: { denied: true },
                });
            }

            const credentials = extractCredentials(context, message);

            if (credentials === undefined) {
                const provenance = await recordDeny(
                    query.requester.principalId,
                    "No credentials provided",
                );
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        "No credentials provided",
                        provenance,
                    ),
                    metadata: { denied: true },
                });
            }

            const authResult = await authProvider.authenticate(credentials);

            if (!authResult.success) {
                const reason = `Authentication failed: ${authResult.error.message}`;
                const provenance = await recordDeny(
                    query.requester.principalId,
                    reason,
                );
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        reason,
                        provenance,
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
                const mod = await import("../auth/node-authorization");
                authorizeAccess = mod.authorizeKnowledgeNodeAccess;
            }

            const authzResult = authorizeAccess(
                principal,
                targetNode,
                authProvider,
                { action: "query-knowledge" },
            );

            if (!authzResult.success) {
                const reason = `Authorization denied: ${authzResult.error.message}`;
                const provenance = createReadProvenance(
                    principal.id,
                    query.targetNodeId,
                    query.queryId,
                    new Date().toISOString(),
                    "deny",
                    { reason: authzResult.error.message },
                );
                await context.audit?.record(provenance);
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        reason,
                        provenance as ContextReadProvenance,
                    ),
                    metadata: {
                        denied: true,
                        reason: authzResult.error.message,
                    },
                });
            }

            const grant = authzResult.data;

            // 5. Execute targeted context query
            // Lazy-load to avoid import cycles
            if (!executeQuery) {
                const mod = await import("../knowledge/context-query");
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

            const allowProvenance = createReadProvenance(
                principal.id,
                query.targetNodeId,
                query.queryId,
                new Date().toISOString(),
                "allow",
                {
                    matchedRoles: grant.matchedRoles,
                    matchedCapabilities: grant.matchedCapabilities,
                },
            );
            await context.audit?.record(allowProvenance);

            const enrichedResult: ContextQueryResult = {
                ...queryResult,
                provenance: {
                    ...(queryResult.provenance ?? {}),
                    ...allowProvenance,
                },
            };

            const responseMessage = buildResponseMessage(
                enrichedResult,
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
