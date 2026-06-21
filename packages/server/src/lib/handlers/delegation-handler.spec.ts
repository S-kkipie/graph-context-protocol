import {
    type AccessPolicyDescriptor,
    createAccessPolicyDescriptor,
    createCapability,
    createDelegationRequest,
    createGraph,
    createKnowledgeNode,
    createMessageHeader,
    createMetadataWithAccessPolicy,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
    type DelegationResult,
    type ProtocolMessage,
    succeed,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createInMemoryAuditSink } from "../audit/implementation";
import type { AuthProvider, Credentials, Principal } from "../auth/types";
import { createDelegationHandler } from "./delegation-handler";
import type { HandlerContext } from "./types";

const SECRET = "SECRET-CANARY-de1e6a7e-DO-NOT-LEAK";
const NODE_ID = "knowledge:deleg";
const owner = createRole("role:owner", "Owner", "");
const creds: Credentials = { type: "token", value: "t", metadata: {} };

const agentRole = createRole("role:agent", "Agent", "", [
    createCapability("cap:read-context", "Read", ""),
]);
const delegatorRole = createRole(
    "role:delegator",
    "Delegator",
    "",
    [createCapability("cap:delegate-task", "Delegate", "")],
    [],
    agentRole,
);

const delegator: Principal = {
    id: "principal:delegator",
    role: delegatorRole,
    capabilities: [],
    metadata: {},
};
const readOnly: Principal = {
    id: "principal:reader",
    role: agentRole,
    capabilities: [],
    metadata: {},
};

function nodeWithPolicy(policy: AccessPolicyDescriptor) {
    return createKnowledgeNode(NODE_ID, owner, {
        tags: ["secret"],
        contentType: "text/plain",
        ...createMetadataWithAccessPolicy(policy),
    });
}

const openToAgents: AccessPolicyDescriptor = createAccessPolicyDescriptor(
    ["role:agent", "role:delegator"],
    ["cap:read-context"],
    false,
    "error",
);

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

function delegationMessage(task = "do the thing"): ProtocolMessage {
    const req = createDelegationRequest(
        "deleg:1",
        createRequesterDescriptor("p:req"),
        NODE_ID,
        task,
    );
    const header = createMessageHeader(
        "msg:deleg:1",
        "node:requester",
        NODE_ID,
        "action-request",
        { correlationId: "corr:1" },
    );
    const ctx = {
        id: "ctx:1",
        graphId: "graph:1",
        currentNode: "node:requester",
        accumulatedData: {},
        role: owner,
        metadata: {},
        createdAt: "2026-06-20T00:00:00.000Z",
        path: ["node:requester"],
    };
    return createProtocolMessage(header, ctx, req);
}

function payloadOf(result: {
    success: boolean;
    data?: { response?: ProtocolMessage };
}): DelegationResult | undefined {
    return result.success
        ? (result.data?.response?.payload as DelegationResult | undefined)
        : undefined;
}

describe("createDelegationHandler", () => {
    it("declares the action-request message type", () => {
        const handler = createDelegationHandler();
        expect(handler.messageTypes).toContain("action-request");
    });

    it("executes the task for a delegate-capable principal and returns completed", async () => {
        let called = false;
        const audit = createInMemoryAuditSink();
        const handler = createDelegationHandler({
            executor: async (task) => {
                called = true;
                return `did: ${task}`;
            },
        });
        const graph = createGraph("graph:1").addNode(
            nodeWithPolicy(openToAgents),
        );
        const context: HandlerContext = {
            serverId: "server:1",
            localNodeId: "node:local",
            graph,
            connections: {} as unknown as HandlerContext["connections"],
            externalAgents:
                {} as unknown as HandlerContext["externalAgents"],
            knowledgeSources:
                {} as unknown as HandlerContext["knowledgeSources"],
            auth: allowAuthn(delegator),
            audit,
            inboundMetadata: { "gcp.credentials": creds },
            metadata: {},
        };

        const result = await handler.handle(delegationMessage(), context);
        const payload = payloadOf(result);

        expect(called).toBe(true);
        expect(payload?.status).toBe("completed");
        expect(payload?.result).toBe("did: do the thing");
        expect(audit.list().some((p) => p.decision === "allow")).toBe(true);
    });

    it("denies a read-only principal WITHOUT calling the executor and never leaks", async () => {
        let called = false;
        const audit = createInMemoryAuditSink();
        const handler = createDelegationHandler({
            executor: async () => {
                called = true;
                return SECRET;
            },
        });
        const graph = createGraph("graph:1").addNode(
            nodeWithPolicy(openToAgents),
        );
        const context: HandlerContext = {
            serverId: "server:1",
            localNodeId: "node:local",
            graph,
            connections: {} as unknown as HandlerContext["connections"],
            externalAgents:
                {} as unknown as HandlerContext["externalAgents"],
            knowledgeSources:
                {} as unknown as HandlerContext["knowledgeSources"],
            auth: allowAuthn(readOnly),
            audit,
            inboundMetadata: { "gcp.credentials": creds },
            metadata: {},
        };

        const result = await handler.handle(delegationMessage(), context);
        const payload = payloadOf(result);

        expect(called).toBe(false);
        expect(payload?.status).toBe("denied");
        expect(JSON.stringify(result)).not.toContain(SECRET);
        expect(audit.list().some((p) => p.decision === "deny")).toBe(true);
    });

    it("returns invalid-request on a malformed payload without calling the executor", async () => {
        let called = false;
        const handler = createDelegationHandler({
            executor: async () => {
                called = true;
                return "x";
            },
        });
        const graph = createGraph("graph:1").addNode(
            nodeWithPolicy(openToAgents),
        );
        const context: HandlerContext = {
            serverId: "server:1",
            localNodeId: "node:local",
            graph,
            connections: {} as unknown as HandlerContext["connections"],
            externalAgents:
                {} as unknown as HandlerContext["externalAgents"],
            knowledgeSources:
                {} as unknown as HandlerContext["knowledgeSources"],
            auth: allowAuthn(delegator),
            inboundMetadata: { "gcp.credentials": creds },
            metadata: {},
        };
        const header = createMessageHeader(
            "msg:bad",
            "node:requester",
            NODE_ID,
            "action-request",
        );
        const badMessage = createProtocolMessage(
            header,
            {
                id: "ctx:1",
                graphId: "graph:1",
                currentNode: "node:requester",
                accumulatedData: {},
                role: owner,
                metadata: {},
                createdAt: "2026-06-20T00:00:00.000Z",
                path: [],
            },
            { not: "a delegation request" },
        );

        const result = await handler.handle(badMessage, context);
        const payload = payloadOf(result);

        expect(called).toBe(false);
        expect(payload?.status).toBe("invalid-request");
    });

    it("returns error when authorized but no executor is wired", async () => {
        const handler = createDelegationHandler();
        const graph = createGraph("graph:1").addNode(
            nodeWithPolicy(openToAgents),
        );
        const context: HandlerContext = {
            serverId: "server:1",
            localNodeId: "node:local",
            graph,
            connections: {} as unknown as HandlerContext["connections"],
            externalAgents:
                {} as unknown as HandlerContext["externalAgents"],
            knowledgeSources:
                {} as unknown as HandlerContext["knowledgeSources"],
            auth: allowAuthn(delegator),
            inboundMetadata: { "gcp.credentials": creds },
            metadata: {},
        };

        const result = await handler.handle(delegationMessage(), context);
        const payload = payloadOf(result);
        expect(payload?.status).toBe("error");
    });
});
