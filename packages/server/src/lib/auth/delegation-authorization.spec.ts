import {
    createAccessPolicyDescriptor,
    createCapability,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
    type GraphNode,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { authorizeTaskDelegation } from "./delegation-authorization";
import { createAllowAllAuthProvider } from "./implementation";
import { authorizeKnowledgeNodeAccess } from "./node-authorization";
import type { Principal } from "./types";

const allowAll = createAllowAllAuthProvider();

// role:agent inherits cap:read-context; role:delegator additionally grants
// cap:delegate-task by inheritance from role:agent.
const agentRole = createRole("role:agent", "Agent", "Reads context", [
    createCapability("cap:read-context", "Read", ""),
]);
const delegatorRole = createRole(
    "role:delegator",
    "Delegator",
    "May delegate tasks",
    [createCapability("cap:delegate-task", "Delegate", "")],
    [],
    agentRole,
);

const readOnlyPrincipal: Principal = {
    id: "principal:reader",
    role: agentRole,
    capabilities: [],
    metadata: {},
};

const delegatorViaRolePrincipal: Principal = {
    id: "principal:delegator-role",
    role: delegatorRole,
    capabilities: [],
    metadata: {},
};

const delegatorViaDirectCapPrincipal: Principal = {
    id: "principal:delegator-direct",
    role: agentRole,
    capabilities: ["cap:delegate-task"],
    metadata: {},
};

const outsiderWithDelegatePrincipal: Principal = {
    id: "principal:outsider",
    role: createRole("role:outsider", "Outsider", "", [
        createCapability("cap:delegate-task", "Delegate", ""),
    ]),
    capabilities: [],
    metadata: {},
};

function nodeWithPolicy(
    nodeId: string,
    readableByRoles: readonly string[],
    requiredCapabilities: readonly string[],
): GraphNode {
    const policy = createAccessPolicyDescriptor(
        readableByRoles,
        requiredCapabilities,
        false,
        "error",
    );
    const owner = createRole("role:owner", "Owner", "");
    return createKnowledgeNode(nodeId, owner, {
        tags: ["test"],
        contentType: "text/plain",
        ...createMetadataWithAccessPolicy(policy),
    });
}

describe("authorizeTaskDelegation", () => {
    it("grants when the principal satisfies the read policy AND holds cap:delegate-task (via role)", () => {
        const node = nodeWithPolicy(
            "knowledge:1",
            ["role:agent", "role:delegator"],
            ["cap:read-context"],
        );
        const result = authorizeTaskDelegation(
            delegatorViaRolePrincipal,
            node,
            allowAll,
        );
        expect(result.success).toBe(true);
    });

    it("grants when cap:delegate-task is held directly on the principal", () => {
        const node = nodeWithPolicy(
            "knowledge:1",
            ["role:agent"],
            ["cap:read-context"],
        );
        const result = authorizeTaskDelegation(
            delegatorViaDirectCapPrincipal,
            node,
            allowAll,
        );
        expect(result.success).toBe(true);
    });

    it("denies a read-capable principal that lacks cap:delegate-task (stricter than read)", () => {
        const node = nodeWithPolicy(
            "knowledge:1",
            ["role:agent"],
            ["cap:read-context"],
        );
        // The same principal CAN read — proving delegation is strictly stronger.
        expect(
            authorizeKnowledgeNodeAccess(readOnlyPrincipal, node, allowAll)
                .success,
        ).toBe(true);
        expect(
            authorizeTaskDelegation(readOnlyPrincipal, node, allowAll).success,
        ).toBe(false);
    });

    it("denies when the read policy denies, even with cap:delegate-task (read-denied ⇒ delegate-denied)", () => {
        const node = nodeWithPolicy(
            "knowledge:1",
            ["role:agent"], // outsider role not in readableByRoles
            ["cap:read-context"],
        );
        // read is denied for the outsider...
        expect(
            authorizeKnowledgeNodeAccess(
                outsiderWithDelegatePrincipal,
                node,
                allowAll,
            ).success,
        ).toBe(false);
        // ...so delegation is denied too, despite holding cap:delegate-task.
        expect(
            authorizeTaskDelegation(
                outsiderWithDelegatePrincipal,
                node,
                allowAll,
            ).success,
        ).toBe(false);
    });

    it("denies on a missing/invalid access policy (default-deny)", () => {
        const owner = createRole("role:owner", "Owner", "");
        const node = createKnowledgeNode("knowledge:nopolicy", owner, {
            tags: ["test"],
            contentType: "text/plain",
        });
        const result = authorizeTaskDelegation(
            delegatorViaDirectCapPrincipal,
            node,
            allowAll,
        );
        expect(result.success).toBe(false);
    });
});
