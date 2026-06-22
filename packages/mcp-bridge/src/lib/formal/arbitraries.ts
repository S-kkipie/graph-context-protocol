/**
 * Minimal fast-check generators for the MCP expose-soundness property.
 * Duplicated (not re-exported from server) to keep test-only generators out of
 * server's public API. Small finite pools keep authorized + unauthorized draws
 * both frequent. The reference oracle is the REAL authorizeKnowledgeNodeAccess
 * (see the property spec), so no abstract admission predicate is needed here.
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
import type { Principal } from "@graph-context-protocol/server";
import fc from "fast-check";

const CAP_IDS: readonly CapabilityId[] = ["cap:1", "cap:2", "cap:3"];
const cap = (id: CapabilityId, name: string) => createCapability(id, name, "");

const roleA: RoleDefinition = createRole("role:a", "A", "", [
    cap("cap:1", "a1"),
]);
const roleB: RoleDefinition = createRole("role:b", "B", "", [
    cap("cap:2", "b2"),
]);
const roleC: RoleDefinition = createRole("role:c", "C", "", []);

const ROLE_IDS: readonly RoleId[] = ["role:a", "role:b", "role:c"];

export const accessPolicyArb: fc.Arbitrary<AccessPolicyDescriptor> = fc
    .record({
        readableByRoles: fc.subarray([...ROLE_IDS]),
        requiredCapabilities: fc.subarray([...CAP_IDS]),
        fallbackAllowed: fc.boolean(),
        denialMode: fc.constantFrom<DenialMode>("error", "empty-result"),
    })
    .map((r) =>
        createAccessPolicyDescriptor(
            r.readableByRoles,
            r.requiredCapabilities,
            r.fallbackAllowed,
            r.denialMode,
        ),
    );

export const principalArb: fc.Arbitrary<Principal> = fc
    .record({
        role: fc.option(fc.constantFrom(roleA, roleB, roleC), {
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

/** Modest run count — each sample stands up a server + in-memory MCP pair. */
export const MCP_RUN_OPTS: { numRuns: number; seed?: number } = {
    numRuns: Number(process.env.FC_NUM_RUNS ?? "50"),
    ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
};
