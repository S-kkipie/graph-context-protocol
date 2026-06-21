/**
 * Task-delegation authorization for Graph Context Protocol.
 *
 * Delegation is a stricter-capability operation on the SAME read-first path as
 * a context query. This gate COMPOSES {@link authorizeKnowledgeNodeAccess}
 * (the proven read gate, left untouched) and then additionally requires the
 * delegation capability. By construction a delegation grant is strictly
 * stronger than a read grant: a principal that can read but lacks
 * `cap:delegate-task` is denied delegation.
 *
 * @module auth/delegation-authorization
 */

import {
    fail,
    type GraphNode,
    type Result,
    SystemCapabilities,
    succeed,
} from "@graph-context-protocol/core";
import type { ServerError } from "../errors";
import { createServerError } from "../errors";
import {
    authorizeKnowledgeNodeAccess,
    type NodeAuthorizationGrant,
    type NodeAuthorizationOptions,
} from "./node-authorization";
import type { AuthProvider, Principal } from "./types";

/** The capability a principal must hold to delegate a task. */
export const DELEGATE_TASK_CAPABILITY = SystemCapabilities.DELEGATE_TASK;

/**
 * Authorizes a principal to delegate a task to the agent owning a knowledge
 * node. Requires everything the read gate requires (role + capabilities +
 * provider) PLUS `cap:delegate-task`.
 *
 * @param principal - The authenticated principal requesting delegation
 * @param targetNode - The gated node the delegated task concerns
 * @param authProvider - The auth provider for baseline authorization
 * @param options - Optional metadata forwarded to the auth provider
 * @returns Result<NodeAuthorizationGrant, ServerError> - success if both read
 *   access and the delegation capability are satisfied; failure otherwise
 */
export function authorizeTaskDelegation(
    principal: Principal,
    targetNode: GraphNode,
    authProvider: AuthProvider,
    options: Pick<NodeAuthorizationOptions, "metadata"> = {},
): Result<NodeAuthorizationGrant, ServerError> {
    // 1. Everything a read requires (role + capabilities + provider).
    //    Action is fixed to "delegate" for audit/provider visibility.
    const readGrant = authorizeKnowledgeNodeAccess(
        principal,
        targetNode,
        authProvider,
        { action: "delegate", metadata: options.metadata },
    );

    if (!readGrant.success) {
        return readGrant;
    }

    // 2. The stricter bit: the delegation capability, direct or via the role chain.
    const effectiveCaps = new Set<string>([
        ...principal.capabilities,
        ...(principal.role
            ? principal.role.getEffectiveCapabilities().map((c) => c.id)
            : []),
    ]);

    if (!effectiveCaps.has(DELEGATE_TASK_CAPABILITY)) {
        return fail(
            createServerError(
                "authorization-error",
                `Missing delegation capability: ${DELEGATE_TASK_CAPABILITY}`,
                {
                    metadata: {
                        nodeId: targetNode.id,
                        principalId: principal.id,
                        requiredCapability: DELEGATE_TASK_CAPABILITY,
                    },
                },
            ),
        );
    }

    return succeed(readGrant.data);
}
