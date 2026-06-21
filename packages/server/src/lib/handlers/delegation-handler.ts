/**
 * Protocol handler for `action-request` (task-delegation) messages.
 *
 * Validates the payload, authenticates the caller, resolves and authorizes the
 * target node for DELEGATION (stricter than read — see
 * {@link authorizeTaskDelegation}), runs the injected executor only on grant,
 * and returns an `action-response` carrying a {@link DelegationResult}. The
 * executor is NEVER called on a denied delegation, so protected content cannot
 * leak through a refused delegation.
 *
 * @module handlers/delegation-handler
 */

import {
    type DelegationRequest,
    DelegationRequestSchema,
    type DelegationResult,
    type DelegationStatus,
    createDelegationResult,
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

/**
 * Executes a delegated task and returns the agent's textual output. Injected by
 * the node owner; in production it wraps the shared agent brain
 * (`runTaskAgent`). Kept out of the handler so the handler stays pure and the
 * LLM dependency is testable.
 */
export type DelegationExecutor = (
    task: string,
    context: DelegationExecutionContext,
) => Promise<string>;

/** Context handed to a {@link DelegationExecutor} on an authorized delegation. */
export interface DelegationExecutionContext {
    readonly targetNodeId: string;
    readonly principal: Principal;
    readonly handlerContext: HandlerContext;
}

/** Dependencies for {@link createDelegationHandler}. */
export interface DelegationHandlerDependencies {
    /** Runs an authorized delegated task. If omitted, grants return `error`. */
    readonly executor?: DelegationExecutor;
}

function resolveTargetNode(
    graph: Graph | undefined,
    targetNodeId: string,
): GraphNode | undefined {
    return graph?.nodes.get(targetNodeId);
}

function buildResponse(
    result: DelegationResult,
    requestMessage: ProtocolMessage,
    localNodeId: string,
): ProtocolMessage {
    const header = createMessageHeader(
        `msg:${result.delegationId}:response`,
        localNodeId,
        requestMessage.header.source,
        "action-response",
        {
            correlationId: requestMessage.header.messageId,
            priority: requestMessage.header.priority,
            metadata: {
                delegationId: result.delegationId,
                status: result.status,
            },
        },
    );
    return createProtocolMessage(header, requestMessage.context, result);
}

function outcome(
    status: DelegationStatus,
    delegationId: string,
    requestMessage: ProtocolMessage,
    localNodeId: string,
    opts: { result?: string; error?: string } = {},
): ProtocolMessage {
    const delegationResult = createDelegationResult(
        delegationId,
        status,
        localNodeId,
        {},
        opts.result,
        opts.error,
    );
    return buildResponse(delegationResult, requestMessage, localNodeId);
}

/**
 * Creates a protocol handler for `action-request` (delegation) messages.
 *
 * @param deps - Optional executor for running authorized delegated tasks
 * @returns A ProtocolHandler for the `action-request` message type
 */
export function createDelegationHandler(
    deps: DelegationHandlerDependencies = {},
): ProtocolHandler {
    let authorizeDelegation: typeof import("../auth/delegation-authorization").authorizeTaskDelegation;

    return {
        name: "delegation-handler",
        messageTypes: ["action-request"],

        async handle(
            message: ProtocolMessage,
            context: HandlerContext,
        ): Promise<Result<HandlerResult, ServerError>> {
            const localNodeId = context.localNodeId;

            // 1. Validate payload
            const validation = DelegationRequestSchema.safeParse(
                message.payload,
            );
            if (!validation.success) {
                const reason = `Invalid delegation payload: ${validation.error.message}`;
                return succeed({
                    handled: true,
                    response: outcome(
                        "invalid-request",
                        "unknown",
                        message,
                        localNodeId,
                        { error: reason },
                    ),
                    metadata: { error: reason },
                });
            }

            const request: DelegationRequest = validation.data;
            const delegationId = request.delegationId;

            const recordDeny = async (
                principalId: string,
                reason: string,
            ): Promise<void> => {
                await context.audit?.record(
                    createReadProvenance(
                        principalId,
                        request.targetNodeId,
                        delegationId,
                        new Date().toISOString(),
                        "deny",
                        { reason: `delegate: ${reason}` },
                    ),
                );
            };

            // 2. Authenticate caller
            const authProvider = context.auth;
            if (authProvider === undefined) {
                await recordDeny(
                    request.requester.principalId,
                    "No auth provider configured",
                );
                return succeed({
                    handled: true,
                    response: outcome(
                        "denied",
                        delegationId,
                        message,
                        localNodeId,
                        { error: "No auth provider configured" },
                    ),
                    metadata: { denied: true },
                });
            }

            const credentials = extractCredentials(context, message);
            if (credentials === undefined) {
                await recordDeny(
                    request.requester.principalId,
                    "No credentials provided",
                );
                return succeed({
                    handled: true,
                    response: outcome(
                        "denied",
                        delegationId,
                        message,
                        localNodeId,
                        { error: "No credentials provided" },
                    ),
                    metadata: { denied: true },
                });
            }

            const authResult = await authProvider.authenticate(credentials);
            if (!authResult.success) {
                const reason = `Authentication failed: ${authResult.error.message}`;
                await recordDeny(request.requester.principalId, reason);
                return succeed({
                    handled: true,
                    response: outcome(
                        "denied",
                        delegationId,
                        message,
                        localNodeId,
                        { error: reason },
                    ),
                    metadata: { denied: true },
                });
            }

            const principal: Principal = authResult.data;

            // 3. Resolve target node
            const targetNode = resolveTargetNode(
                context.graph,
                request.targetNodeId,
            );
            if (targetNode === undefined) {
                return succeed({
                    handled: true,
                    response: outcome(
                        "not-found",
                        delegationId,
                        message,
                        localNodeId,
                        { error: "Target node not found in graph" },
                    ),
                    metadata: { notFound: true },
                });
            }

            // 4. Authorize delegation (read gate + cap:delegate-task)
            if (!authorizeDelegation) {
                const mod = await import("../auth/delegation-authorization");
                authorizeDelegation = mod.authorizeTaskDelegation;
            }
            const authzResult = authorizeDelegation(
                principal,
                targetNode,
                authProvider,
            );
            if (!authzResult.success) {
                const reason = authzResult.error.message;
                await recordDeny(principal.id, reason);
                return succeed({
                    handled: true,
                    response: outcome(
                        "denied",
                        delegationId,
                        message,
                        localNodeId,
                        { error: `Delegation denied: ${reason}` },
                    ),
                    metadata: { denied: true, reason },
                });
            }

            const grant = authzResult.data;

            // 5. Execute — only reached on an authorized delegation.
            if (deps.executor === undefined) {
                return succeed({
                    handled: true,
                    response: outcome(
                        "error",
                        delegationId,
                        message,
                        localNodeId,
                        { error: "No delegation executor configured" },
                    ),
                    metadata: { error: "no-executor" },
                });
            }

            let executorOutput: string;
            try {
                executorOutput = await deps.executor(request.task, {
                    targetNodeId: request.targetNodeId,
                    principal,
                    handlerContext: context,
                });
            } catch (error) {
                const reason =
                    error instanceof Error ? error.message : String(error);
                return succeed({
                    handled: true,
                    response: outcome(
                        "error",
                        delegationId,
                        message,
                        localNodeId,
                        { error: `Executor failed: ${reason}` },
                    ),
                    metadata: { error: reason },
                });
            }

            await context.audit?.record(
                createReadProvenance(
                    principal.id,
                    request.targetNodeId,
                    delegationId,
                    new Date().toISOString(),
                    "allow",
                    {
                        matchedRoles: grant.matchedRoles,
                        matchedCapabilities: grant.matchedCapabilities,
                        reason: "delegate: granted",
                    },
                ),
            );

            return succeed({
                handled: true,
                response: outcome(
                    "completed",
                    delegationId,
                    message,
                    localNodeId,
                    { result: executorOutput },
                ),
                metadata: {
                    delegationId,
                    status: "completed",
                    targetNodeId: request.targetNodeId,
                },
            });
        },
    };
}
