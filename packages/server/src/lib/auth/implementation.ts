/**
 * Authentication and authorization provider implementations.
 *
 * @module auth/implementation
 */

import type { CapabilityId } from "@graph-context-protocol/core";
import { fail, succeed } from "@graph-context-protocol/core";
import { createServerError } from "../errors.js";
import type {
    AuthAction,
    AuthorizationRequest,
    AuthProvider,
    Credentials,
    Principal,
} from "./types.js";

type CapabilityRequirement = CapabilityId | readonly CapabilityId[];

type CapabilityRequirements =
    | CapabilityRequirement
    | ReadonlyMap<AuthAction, CapabilityRequirement>
    | Partial<Record<AuthAction, CapabilityRequirement>>;

/**
 * Creates an auth provider that authenticates and authorizes every request.
 * Intended for tests and local development only.
 *
 * @returns Auth provider that allows every credential and action
 */
export function createAllowAllAuthProvider(): AuthProvider {
    return {
        async authenticate(credentials: Credentials) {
            if (isPrincipal(credentials.value)) {
                return succeed(credentials.value);
            }

            return succeed({
                id: "principal:allow-all",
                agentId: getStringMetadata(credentials, "agentId"),
                capabilities: [],
                metadata: credentials.metadata ?? {},
            });
        },

        authorize() {
            return succeed({ allowed: true });
        },
    };
}

/**
 * Creates an auth provider that authenticates static bearer-style tokens.
 *
 * @param tokens - Map from token string to authenticated principal
 * @returns Auth provider backed by the static token map
 */
export function createStaticTokenAuthProvider(
    tokens: ReadonlyMap<string, Principal>,
): AuthProvider {
    const tokenPrincipals = new Map(tokens);

    return {
        async authenticate(credentials: Credentials) {
            if (
                credentials.type !== "token" ||
                typeof credentials.value !== "string"
            ) {
                return fail(
                    createServerError(
                        "auth-error",
                        "Static token authentication requires token credentials",
                    ),
                );
            }

            const principal = tokenPrincipals.get(credentials.value);
            if (!principal) {
                return fail(
                    createServerError(
                        "auth-error",
                        "Static token authentication failed",
                        {
                            metadata: { credentialType: credentials.type },
                        },
                    ),
                );
            }

            return succeed(principal);
        },

        authorize() {
            return succeed({ allowed: true });
        },
    };
}

/**
 * Creates an auth provider that delegates authentication and checks capabilities
 * during authorization.
 *
 * Requirements can be a single capability for all actions, a list of capabilities
 * for all actions, or action-specific requirements in a Map/record.
 *
 * @param requirements - Required capability or action-specific capabilities
 * @param delegate - Provider used for authentication and baseline authorization
 * @returns Auth provider that denies actions missing required capabilities
 */
export function createCapabilityAuthProvider(
    requirements: CapabilityRequirements,
    delegate: AuthProvider = createAllowAllAuthProvider(),
): AuthProvider {
    return {
        authenticate(credentials: Credentials) {
            return delegate.authenticate(credentials);
        },

        authorize(principal: Principal, request: AuthorizationRequest) {
            const delegatedDecision = delegate.authorize(principal, request);
            if (!delegatedDecision.success || !delegatedDecision.data.allowed) {
                return delegatedDecision;
            }

            const requiredCapabilities = getRequiredCapabilities(
                requirements,
                request.action,
            );
            const missingCapabilities = requiredCapabilities.filter(
                (capabilityId) =>
                    !principalHasCapability(principal, capabilityId),
            );

            if (missingCapabilities.length > 0) {
                return succeed({
                    allowed: false,
                    reason: `Missing required capabilities: ${missingCapabilities.join(", ")}`,
                    metadata: { missingCapabilities },
                });
            }

            return succeed({
                allowed: true,
                metadata: { requiredCapabilities },
            });
        },
    };
}

function getRequiredCapabilities(
    requirements: CapabilityRequirements,
    action: AuthAction,
): readonly CapabilityId[] {
    if (isRequirementMap(requirements)) {
        return normalizeRequirement(requirements.get(action));
    }

    if (isRequirementRecord(requirements)) {
        return normalizeRequirement(requirements[action]);
    }

    return normalizeRequirement(requirements);
}

function normalizeRequirement(
    requirement: CapabilityRequirement | undefined,
): readonly CapabilityId[] {
    if (!requirement) {
        return [];
    }

    return typeof requirement === "string" ? [requirement] : requirement;
}

function isRequirementMap(
    requirements: CapabilityRequirements,
): requirements is ReadonlyMap<AuthAction, CapabilityRequirement> {
    return requirements instanceof Map;
}

function isRequirementRecord(
    requirements: CapabilityRequirements,
): requirements is Partial<Record<AuthAction, CapabilityRequirement>> {
    return (
        typeof requirements === "object" &&
        requirements !== null &&
        !Array.isArray(requirements) &&
        !isRequirementMap(requirements)
    );
}

function principalHasCapability(
    principal: Principal,
    capabilityId: CapabilityId,
): boolean {
    return (
        principal.capabilities.includes(capabilityId) ||
        principal.role?.hasCapability(capabilityId) === true
    );
}

function getStringMetadata(
    credentials: Credentials,
    key: string,
): string | undefined {
    const value = credentials.metadata?.[key];
    return typeof value === "string" ? value : undefined;
}

function isPrincipal(value: unknown): value is Principal {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Partial<Principal>;
    return (
        typeof candidate.id === "string" &&
        Array.isArray(candidate.capabilities) &&
        typeof candidate.metadata === "object" &&
        candidate.metadata !== null
    );
}
