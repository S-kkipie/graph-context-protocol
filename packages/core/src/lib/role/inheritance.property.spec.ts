/**
 * P3 — role-inheritance soundness. A role's effective capabilities equal the
 * union of own + inherited own-capabilities along the parent chain (no phantom
 * capability, none lost); own-first precedence on duplicate ids.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCapability, createRole } from "./role-factories";
import type { RoleDefinition } from "./role-types";

const RUN_OPTS: { numRuns: number; seed?: number } = {
    numRuns: Number(process.env.FC_NUM_RUNS ?? "1000"),
    ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
};

const CAP_POOL = ["cap:1", "cap:2", "cap:3", "cap:4", "cap:5"];

/** Generates a chain (root → ... → leaf) of own-capability id sets, depth 2..4. */
const chainArb: fc.Arbitrary<string[][]> = fc.array(fc.subarray(CAP_POOL), {
    minLength: 2,
    maxLength: 4,
});

/** Builds a role chain from root to leaf; returns the leaf role + the union of ids. */
function buildChain(levels: string[][]): {
    leaf: RoleDefinition;
    unionIds: Set<string>;
} {
    let parent: RoleDefinition | undefined;
    const unionIds = new Set<string>();
    levels.forEach((ownIds, depth) => {
        for (const id of ownIds) unionIds.add(id);
        const caps = ownIds.map((id) =>
            createCapability(id, `d${depth}-${id}`, ""),
        );
        parent = createRole(
            `role:d${depth}`,
            `D${depth}`,
            "",
            caps,
            [],
            parent,
        );
    });
    // parent is defined because levels has at least one entry.
    return { leaf: parent as RoleDefinition, unionIds };
}

describe("P3 — role-inheritance soundness", () => {
    it("effective caps equal the union of own caps along the chain", () => {
        fc.assert(
            fc.property(chainArb, (levels) => {
                const { leaf, unionIds } = buildChain(levels);
                const effIds = new Set(
                    leaf.getEffectiveCapabilities().map((c) => c.id),
                );
                expect(effIds).toEqual(unionIds);
            }),
            RUN_OPTS,
        );
    });

    it("own-first precedence: most-derived role wins on duplicate ids", () => {
        // Parent and child both own cap:1 with different names; child wins.
        const parent = createRole("role:parent", "P", "", [
            createCapability("cap:1", "parent-cap1", ""),
        ]);
        const child = createRole(
            "role:child",
            "C",
            "",
            [createCapability("cap:1", "child-cap1", "")],
            [],
            parent,
        );
        const eff = child.getEffectiveCapabilities();
        const cap1 = eff.find((c) => c.id === "cap:1");
        expect(cap1?.name).toBe("child-cap1");
    });
});
