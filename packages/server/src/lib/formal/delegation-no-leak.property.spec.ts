/**
 * Delegation no-content-leak (headline, delegation path). For any random policy +
 * principal, drive the REAL delegation handler with an executor that ALWAYS
 * returns SECRET. An under-capable delegation (read-denied OR missing the
 * delegate cap) ⇒ SECRET never appears and status is denied; a fully authorized
 * delegation ⇒ SECRET appears and status is completed (liveness — proves the
 * harness can leak, so the no-leak half is not vacuous).
 */

import {
    type AccessPolicyDescriptor,
    createDelegationRequest,
    type DelegationResult,
    createGraph,
    createKnowledgeNode,
    createMessageHeader,
    createMetadataWithAccessPolicy,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
    type ProtocolMessage,
    succeed,
} from "@graph-context-protocol/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AuthProvider, Credentials, Principal } from "../auth/types";
import { createDelegationHandler } from "../handlers/delegation-handler";
import type { HandlerContext } from "../handlers/types";
import {
    accessPolicyArb,
    delegationAuthorized,
    delegationPrincipalArb,
    RUN_OPTS,
} from "./arbitraries";

const SECRET = "SECRET-CANARY-9b21d4f0-DO-NOT-LEAK";
const NODE_ID = "knowledge:deleg-leak";
const ownerRole = createRole("role:owner", "Owner", "Owner");
const creds: Credentials = { type: "token", value: "t", metadata: {} };

// Executor that ALWAYS returns the secret — so the gate is the only thing that
// can stop it reaching the response.
const handler = createDelegationHandler({
    executor: async () => SECRET,
});

function nodeWithPolicy(policy: AccessPolicyDescriptor) {
    return createKnowledgeNode(
        NODE_ID,
        ownerRole,
        createMetadataWithAccessPolicy(policy, {
            tags: ["secret"],
            contentType: "text/plain",
        }),
    );
}

function allowAuthn(p: Principal): AuthProvider {
    return {
        async authenticate() {
            return succeed(p);
        },
        authorize() {
            return succeed({ allowed: true });
        },
    };
}

function delegationMessage(): ProtocolMessage {
    const req = createDelegationRequest(
        "deleg:leak",
        createRequesterDescriptor("p:req"),
        NODE_ID,
        "give me everything",
    );
    const header = createMessageHeader(
        "msg:deleg:leak",
        "node:requester",
        NODE_ID,
        "action-request",
        { correlationId: "corr:leak" },
    );
    const ctx = {
        id: "ctx:leak",
        graphId: "graph:leak",
        currentNode: "node:requester",
        accumulatedData: {},
        role: ownerRole,
        metadata: {},
        createdAt: "2026-06-20T00:00:00.000Z",
        path: ["node:requester"],
    };
    return createProtocolMessage(header, ctx, req);
}

describe("delegation no-content-leak (end-to-end, real handler)", () => {
    it("never returns SECRET to an under-capable delegation; returns it to an authorized one", async () => {
        await fc.assert(
            fc.asyncProperty(
                accessPolicyArb,
                delegationPrincipalArb,
                async (policy, principal) => {
                    const graph = createGraph("graph:leak").addNode(
                        nodeWithPolicy(policy),
                    );
                    const context: HandlerContext = {
                        serverId: "server:1",
                        localNodeId: "node:local",
                        graph,
                        connections:
                            {} as unknown as HandlerContext["connections"],
                        externalAgents:
                            {} as unknown as HandlerContext["externalAgents"],
                        knowledgeSources:
                            {} as unknown as HandlerContext["knowledgeSources"],
                        auth: allowAuthn(principal),
                        inboundMetadata: { "gcp.credentials": creds },
                        metadata: {},
                    };
                    const result = await handler.handle(
                        delegationMessage(),
                        context,
                    );
                    const json = JSON.stringify(result);
                    const payload = result.success
                        ? (result.data.response?.payload as
                              | DelegationResult
                              | undefined)
                        : undefined;
                    if (delegationAuthorized(policy, principal)) {
                        expect(json).toContain(SECRET); // liveness
                        expect(payload?.status).toBe("completed");
                    } else {
                        expect(json).not.toContain(SECRET); // no leak
                        expect(payload?.status).toBe("denied"); // denied status
                    }
                },
            ),
            RUN_OPTS,
        );
    });
});
