/**
 * P2 — authorize soundness. authorizeKnowledgeNodeAccess grants access iff the
 * independent reference predicate says the principal satisfies the policy, over
 * a randomized policy/principal space, against the REAL gate.
 */

import {
    type AccessPolicyDescriptor,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
    type GraphNode,
} from "@graph-context-protocol/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { authorizeKnowledgeNodeAccess } from "../auth/node-authorization";
import type { AuthProvider } from "../auth/types";
import {
    accessPolicyArb,
    authorized,
    principalArb,
    RUN_OPTS,
} from "./arbitraries";

const ownerRole = createRole("role:owner", "Owner", "Owner");

function nodeWithPolicy(policy: AccessPolicyDescriptor): GraphNode {
    return createKnowledgeNode(
        "knowledge:p2",
        ownerRole,
        createMetadataWithAccessPolicy(policy, {
            tags: ["secret"],
            contentType: "text/plain",
        }),
    );
}

const allowAll: AuthProvider = {
    async authenticate() {
        throw new Error("unused");
    },
    authorize() {
        return { success: true, data: { allowed: true } };
    },
};

describe("P2 — authorize soundness", () => {
    it("grants iff the reference predicate admits the principal", () => {
        fc.assert(
            fc.property(accessPolicyArb, principalArb, (policy, principal) => {
                const node = nodeWithPolicy(policy);
                const result = authorizeKnowledgeNodeAccess(
                    principal,
                    node,
                    allowAll,
                );
                expect(result.success).toBe(authorized(policy, principal));
            }),
            RUN_OPTS,
        );
    });
});
