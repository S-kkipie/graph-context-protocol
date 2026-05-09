/**
 * Node-centered authorization helper for Graph Context Protocol.
 *
 * Resolves a target node, validates its knowledge kind, parses its
 * `gcp.accessPolicy` metadata, and checks the principal's role and
 * capabilities against the policy before delegating to the auth provider.
 *
 * Denies queries safely without throwing for authorization denial.
 *
 * @module auth/node-authorization
 */

import {
    fail,
    GCP_ACCESS_POLICY_METADATA_KEY,
    parseAccessPolicyFromMetadata,
    succeed,
    type GraphNode,
    type Result,
} from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import { createServerError } from "../errors.js";
import type {
    AuthAction,
    AuthorizationRequest,
    AuthProvider,
    Principal,
} from "./types.js";

/**
 * Authorization options for node-level access control.
 */
export interface NodeAuthorizationOptions {
    /** The action to authorize. Defaults to "query-knowledge". */
    readonly action?: AuthAction;
    /** Additional metadata passed to the auth provider's authorize request. */
    readonly metadata?: Record<string, unknown>;
}

/**
 * Authorizes a principal for a knowledge node by checking the node's
 * access policy and delegating to the auth provider.
 *
 * @param principal - The authenticated principal requesting access
 * @param targetNode - The target graph node to authorize against
 * @param authProvider - The auth provider for baseline authorization
 * @param options - Optional action override and metadata
 * @returns Result<void, ServerError> - success if authorized, failure with denial details
 *
 * @example
 * ```typescript
 * const result = authorizeKnowledgeNodeAccess(principal, knowledgeNode, authProvider);
 * if (!result.success) {
 *     // Access denied — result.error contains denial details
 *     return createContextQueryResult(queryId, "denied", localNodeId);
 * }
 * // Access granted — proceed with query
 * ```
 */
export function authorizeKnowledgeNodeAccess(
    principal: Principal,
    targetNode: GraphNode,
    authProvider: AuthProvider,
    options: NodeAuthorizationOptions = {},
): Result<void, ServerError> {
    // 1. Verify target is a knowledge node
    if (targetNode.kind !== "knowledge") {
        return fail(
            createServerError(
                "authorization-error",
                "Target node is not a knowledge node",
                {
                    metadata: {
                        nodeId: targetNode.id,
                        nodeKind: targetNode.kind,
                    },
                },
            ),
        );
    }

    // 2. Parse access policy from node metadata
    const policyResult = parseAccessPolicyFromMetadata(targetNode.metadata);

    if (!policyResult.success) {
        return fail(
            createServerError(
                "authorization-error",
                "Missing or invalid access policy on knowledge node",
                {
                    metadata: {
                        nodeId: targetNode.id,
                        metadataKey: GCP_ACCESS_POLICY_METADATA_KEY,
                    },
                },
            ),
        );
    }

    const policy = policyResult.data;

    // 3. Check principal's role against readableByRoles
    const principalRoleId = principal.role?.id;

    if (policy.readableByRoles.length > 0) {
        if (principalRoleId === undefined) {
            return fail(
                createServerError(
                    "authorization-error",
                    "Principal is missing a role required by readableByRoles",
                    {
                        metadata: {
                            nodeId: targetNode.id,
                            readableByRoles: policy.readableByRoles,
                        },
                    },
                ),
            );
        }

        const roleAllowed = policy.readableByRoles.includes(principalRoleId);
        if (!roleAllowed) {
            return fail(
                createServerError(
                    "authorization-error",
                    `Principal role "${principalRoleId}" is not in readableByRoles`,
                    {
                        metadata: {
                            nodeId: targetNode.id,
                            principalRoleId,
                            readableByRoles: policy.readableByRoles,
                        },
                    },
                ),
            );
        }
    }

    // 4. Check principal's capabilities against required capabilities
    if (policy.requiredCapabilities.length > 0) {
        const principalDirectCaps = new Set(principal.capabilities);
        const principalRoleCaps = principal.role
            ? new Set(principal.role.capabilities.map((c) => c.id))
            : new Set<string>();

        const missingCapabilities = policy.requiredCapabilities.filter(
            (requiredCap) =>
                !principalDirectCaps.has(requiredCap) &&
                !principalRoleCaps.has(requiredCap),
        );

        if (missingCapabilities.length > 0) {
            return fail(
                createServerError(
                    "authorization-error",
                    `Missing required capabilities: ${missingCapabilities.join(", ")}`,
                    {
                        metadata: {
                            nodeId: targetNode.id,
                            missingCapabilities,
                            requiredCapabilities: policy.requiredCapabilities,
                        },
                    },
                ),
            );
        }
    }

    // 5. Delegate to auth provider for baseline authorization
    const action = options.action ?? "query-knowledge";

    const authRequest: AuthorizationRequest = {
        action,
        targetNodeId: targetNode.id,
        metadata: options.metadata,
    };

    const authResult = authProvider.authorize(principal, authRequest);

    if (!authResult.success) {
        return fail(authResult.error);
    }

    if (!authResult.data.allowed) {
        return fail(
            createServerError(
                "authorization-error",
                authResult.data.reason ?? "Authorization denied",
                {
                    metadata: {
                        nodeId: targetNode.id,
                        principalId: principal.id,
                        action,
                        providerReason: authResult.data.reason,
                    },
                },
            ),
        );
    }

    return succeed(undefined);
}
