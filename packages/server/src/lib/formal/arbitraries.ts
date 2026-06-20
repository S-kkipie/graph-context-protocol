/**
 * fast-check generators + the reference admission predicate for the no-leak
 * properties. Small finite pools keep both authorized and unauthorized draws
 * frequent. The predicate mirrors `authorizeKnowledgeNodeAccess` exactly under
 * an allow-all auth provider (so the provider term drops out).
 *
 * @module formal/arbitraries
 */

import {
    type AccessPolicyDescriptor,
    type CapabilityId,
    createAccessPolicyDescriptor,
    createCapability,
    createRole,
    type DenialMode,
    type RoleDefinition,
    type RoleId,
} from "@graph-context-protocol/core";
import fc from "fast-check";
import type { Principal } from "../auth/types";

/** Fixed capability pool. */
export const CAP_IDS: readonly CapabilityId[] = [
    "cap:1",
    "cap:2",
    "cap:3",
    "cap:4",
    "cap:5",
];

const cap = (id: CapabilityId, name: string) => createCapability(id, name, "");

/** Fixed role pool. role:child inherits from role:a (effective {cap:1, cap:3}). */
export const roleA: RoleDefinition = createRole("role:a", "A", "", [
    cap("cap:1", "a-cap1"),
]);
export const roleB: RoleDefinition = createRole("role:b", "B", "", [
    cap("cap:2", "b-cap2"),
]);
export const roleC: RoleDefinition = createRole("role:c", "C", "", []);
export const roleChild: RoleDefinition = createRole(
    "role:child",
    "Child",
    "",
    [cap("cap:3", "child-cap3")],
    [],
    roleA,
);

/** Role-id pool used in access policies. */
export const ROLE_IDS: readonly RoleId[] = [
    "role:a",
    "role:b",
    "role:c",
    "role:child",
];

/** Random access policy over the fixed pools. */
export const accessPolicyArb: fc.Arbitrary<AccessPolicyDescriptor> = fc
    .record({
        readableByRoles: fc.subarray([...ROLE_IDS]),
        requiredCapabilities: fc.subarray([...CAP_IDS]),
        fallbackAllowed: fc.boolean(),
        denialMode: fc.constantFrom<DenialMode>(
            "error",
            "empty-result",
            "fallback-if-allowed",
        ),
    })
    .map((r) =>
        createAccessPolicyDescriptor(
            r.readableByRoles,
            r.requiredCapabilities,
            r.fallbackAllowed,
            r.denialMode,
        ),
    );

/** Random principal: a role from the pool (or none) + random direct caps. */
export const principalArb: fc.Arbitrary<Principal> = fc
    .record({
        role: fc.option(fc.constantFrom(roleA, roleB, roleC, roleChild), {
            nil: undefined,
        }),
        capabilities: fc.subarray([...CAP_IDS]),
    })
    .map(
        ({ role, capabilities }) =>
            ({
                id: "principal:test",
                role,
                capabilities,
                metadata: {},
            }) as Principal,
    );

/**
 * Independent admission oracle. Mirrors authorizeKnowledgeNodeAccess under an
 * allow-all provider: role ok when readableByRoles is empty or contains the
 * principal's role; all requiredCapabilities present directly or via the role
 * chain.
 */
export function authorized(
    policy: AccessPolicyDescriptor,
    principal: Principal,
): boolean {
    const roleOk =
        policy.readableByRoles.length === 0 ||
        (principal.role !== undefined &&
            policy.readableByRoles.includes(principal.role.id));
    if (!roleOk) return false;
    if (policy.requiredCapabilities.length === 0) return true;
    const effective = new Set<string>([
        ...principal.capabilities,
        ...(principal.role
            ? principal.role.getEffectiveCapabilities().map((c) => c.id)
            : []),
    ]);
    return policy.requiredCapabilities.every((c) => effective.has(c));
}

/** fast-check run options: bounded in CI, heavier via FC_NUM_RUNS; FC_SEED to repro. */
export const RUN_OPTS: { numRuns: number; seed?: number } = {
    numRuns: Number(process.env.FC_NUM_RUNS ?? "1000"),
    ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
};
