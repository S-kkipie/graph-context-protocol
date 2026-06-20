/**
 * P1 — end-to-end no-content-leak (headline). For any random policy + principal,
 * drive the REAL context-query handler against a stub adapter that ALWAYS
 * returns SECRET. Unauthorized ⇒ SECRET never appears and status is denied;
 * authorized ⇒ SECRET appears (liveness — proves the harness can leak, so the
 * no-leak half is not vacuous).
 */

import {
    type AccessPolicyDescriptor,
    type ContextQuery,
    type ContextQueryResult,
    createContextQuery,
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
import { createContextQueryHandler } from "../handlers/context-query-handler";
import type { HandlerContext } from "../handlers/types";
import { createKnowledgeSourceRegistry } from "../knowledge/implementation";
import {
    accessPolicyArb,
    authorized,
    principalArb,
    RUN_OPTS,
} from "./arbitraries";

const SECRET = "SECRET-CANARY-7f3a9c2e-DO-NOT-LEAK";
const NODE_ID = "knowledge:p1";
const ownerRole = createRole("role:owner", "Owner", "Owner");
const creds: Credentials = { type: "token", value: "t", metadata: {} };
const handler = createContextQueryHandler();

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

/** Registry whose only adapter ALWAYS returns the secret in `raw`. */
function secretRegistry() {
    const reg = createKnowledgeSourceRegistry();
    const r = reg.register({
        id: NODE_ID,
        capabilities: ["search"] as const,
        query: async () =>
            succeed({
                sourceId: NODE_ID,
                nodes: [],
                raw: { content: SECRET },
                metadata: {},
            }),
    });
    if (!r.success) throw new Error(r.error.message);
    return r.data;
}

/** Auth provider that authenticates as `p` and always allows (gate isolated). */
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

function queryMessage(query: ContextQuery): ProtocolMessage {
    const header = createMessageHeader(
        "msg:p1",
        "node:requester",
        query.targetNodeId,
        "context-query",
        { correlationId: "corr:p1" },
    );
    const ctx = {
        id: "ctx:p1",
        graphId: "graph:p1",
        currentNode: "node:requester",
        accumulatedData: {},
        role: ownerRole,
        metadata: {},
        createdAt: "2026-06-20T00:00:00.000Z",
        path: ["node:requester"],
    };
    return createProtocolMessage(header, ctx, query);
}

describe("P1 — no-content-leak (end-to-end, real handler)", () => {
    it("never returns SECRET to an unauthorized principal; returns it to an authorized one", async () => {
        await fc.assert(
            fc.asyncProperty(
                accessPolicyArb,
                principalArb,
                async (policy, principal) => {
                    const graph = createGraph("graph:p1").addNode(
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
                        knowledgeSources: secretRegistry(),
                        auth: allowAuthn(principal),
                        inboundMetadata: { "gcp.credentials": creds },
                        metadata: {},
                    };
                    const query = createContextQuery(
                        "query:p1",
                        createRequesterDescriptor("p:req"),
                        NODE_ID,
                        "text",
                        "give me everything",
                    );
                    const result = await handler.handle(
                        queryMessage(query),
                        context,
                    );
                    const json = JSON.stringify(result);
                    const payload = result.success
                        ? (result.data.response?.payload as
                              | ContextQueryResult
                              | undefined)
                        : undefined;
                    if (authorized(policy, principal)) {
                        expect(json).toContain(SECRET); // liveness
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
