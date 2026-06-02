/**
 * Authentication and authorization provider types.
 *
 * @module auth/types
 */

import type {
    CapabilityId,
    Metadata,
    NodeId,
    ProtocolMessage,
    Result,
    RoleDefinition,
} from "@graph-context-protocol/core";
import type { ServerError } from "../errors";
import type { ExternalAgentId } from "../types";

/**
 * Authenticated identity for a remote caller.
 */
export interface Principal {
    /** Stable principal identifier */
    readonly id: string;
    /** External agent represented by this principal, if any */
    readonly agentId?: ExternalAgentId;
    /** Optional graph role bound to the principal */
    readonly role?: RoleDefinition;
    /** Capability identifiers granted directly to this principal */
    readonly capabilities: readonly CapabilityId[];
    /** Additional principal metadata */
    readonly metadata: Metadata;
}

/**
 * Credentials submitted to an auth provider.
 */
export interface Credentials {
    /** Credential scheme, such as token */
    readonly type: string;
    /** Provider-specific credential value */
    readonly value: unknown;
    /** Additional credential metadata */
    readonly metadata?: Metadata;
}

/**
 * Server actions that can be authorized.
 */
export type AuthAction =
    | "connect"
    | "send-message"
    | "receive-message"
    | "query-knowledge"
    | "sync-knowledge"
    | "discover-agent";

/**
 * Authorization request for a principal action.
 */
export interface AuthorizationRequest {
    /** Action being attempted */
    readonly action: AuthAction;
    /** Protocol message involved in the action, if any */
    readonly message?: ProtocolMessage;
    /** Target graph node for the action, if any */
    readonly targetNodeId?: NodeId;
    /** Additional authorization metadata */
    readonly metadata?: Metadata;
}

/**
 * Authorization decision returned by an auth provider.
 */
export interface AuthorizationDecision {
    /** Whether the request is allowed */
    readonly allowed: boolean;
    /** Human-readable denial or audit reason */
    readonly reason?: string;
    /** Additional decision metadata */
    readonly metadata?: Metadata;
}

/**
 * Auth provider for authenticating credentials and authorizing actions.
 */
export interface AuthProvider {
    /**
     * Authenticates credentials and returns a principal.
     *
     * @param credentials - Credentials to validate
     * @returns Result containing the authenticated principal or server error
     */
    authenticate(
        credentials: Credentials,
    ): Promise<Result<Principal, ServerError>>;

    /**
     * Authorizes an action for an authenticated principal.
     *
     * @param principal - Authenticated principal
     * @param request - Authorization request
     * @returns Result containing the authorization decision or server error
     */
    authorize(
        principal: Principal,
        request: AuthorizationRequest,
    ): Result<AuthorizationDecision, ServerError>;
}
