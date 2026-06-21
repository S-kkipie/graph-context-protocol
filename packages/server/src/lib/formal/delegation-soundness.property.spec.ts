/**
 * P4 — delegation soundness. authorizeTaskDelegation grants iff the independent
 * reference predicate admits the principal for delegation: read-authorized AND
 * holding cap:delegate-task. Over a randomized policy/principal space, against
 * the REAL gate. This pins that delegation is strictly stronger than read — a
 * read-authorized principal lacking the delegate capability is always denied.
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
import { authorizeTaskDelegation } from "../auth/delegation-authorization";
import { authorizeKnowledgeNodeAccess } from "../auth/node-authorization";
import type { AuthProvider } from "../auth/types";
import {
    accessPolicyArb,
    authorized,
    delegationAuthorized,
    delegationPrincipalArb,
    hasDelegateCapability,
    RUN_OPTS,
} from "./arbitraries";

const ownerRole = createRole("role:owner", "Owner", "Owner");

function nodeWithPolicy(policy: AccessPolicyDescriptor): GraphNode {
    return createKnowledgeNode(
        "knowledge:p4",
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

describe("P4 — delegation soundness", () => {
    it("grants iff the reference predicate admits the principal for delegation", () => {
        fc.assert(
            fc.property(
                accessPolicyArb,
                delegationPrincipalArb,
                (policy, principal) => {
                    const node = nodeWithPolicy(policy);
                    const result = authorizeTaskDelegation(
                        principal,
                        node,
                        allowAll,
                    );
                    expect(result.success).toBe(
                        delegationAuthorized(policy, principal),
                    );
                },
            ),
            RUN_OPTS,
        );
    });

    it("is strictly stronger than read: a read-authorized principal without the delegate cap is denied", () => {
        fc.assert(
            fc.property(
                accessPolicyArb,
                delegationPrincipalArb,
                (policy, principal) => {
                    // Only consider principals that CAN read but lack the delegate cap.
                    fc.pre(
                        authorized(policy, principal) &&
                            !hasDelegateCapability(principal),
                    );
                    const node = nodeWithPolicy(policy);
                    expect(
                        authorizeKnowledgeNodeAccess(principal, node, allowAll)
                            .success,
                    ).toBe(true);
                    expect(
                        authorizeTaskDelegation(principal, node, allowAll)
                            .success,
                    ).toBe(false);
                },
            ),
            RUN_OPTS,
        );
    });
});
