import {
    type ContextPeerDescriptor,
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type ProtocolMessage,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import type { ExternalAgentRegistry } from "../agents/types";
import type { KnowledgeSourceRegistry } from "../knowledge/types";
import { createPeerRegistry } from "../peers/implementation";
import { createMessageRouter } from "./implementation";
import type { RoutingContext } from "./types";

function createMessage(target: string): ProtocolMessage {
    const header = createMessageHeader(
        "msg:test",
        "node:source",
        target,
        "notification",
    );
    const ctx = {
        id: "ctx:test",
        graphId: "graph:test",
        currentNode: "node:source",
        accumulatedData: {},
        role: createRole("role:test", "Test Role", "A test role"),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:source"],
    };
    return createProtocolMessage(header, ctx, { value: "test" });
}

function makeContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
    const externalAgents = {
        getByNodeId: (nodeId: string) =>
            nodeId === "node:ext"
                ? {
                      id: "ext:1",
                      connectionId: "conn:1",
                      transportId: "transport:1",
                      status: "online",
                  }
                : undefined,
    } as unknown as ExternalAgentRegistry;

    return {
        localNodeId: "node:local",
        connections: {} as unknown as RoutingContext["connections"],
        externalAgents,
        knowledgeSources: {} as unknown as KnowledgeSourceRegistry,
        ...overrides,
    };
}

describe("createMessageRouter", () => {
    const router = createMessageRouter();

    it("routes a message addressed to the local node to local-handler", () => {
        const result = router.route(createMessage("node:local"), makeContext());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("local-handler");
            expect(result.data.targetNodeId).toBe("node:local");
        }
    });

    it("routes a known external agent to external-agent", () => {
        const result = router.route(createMessage("node:ext"), makeContext());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("external-agent");
            expect(result.data.externalAgentId).toBe("ext:1");
            expect(result.data.transportId).toBe("transport:1");
        }
    });

    it("routes an unknown target to undeliverable", () => {
        const result = router.route(createMessage("node:nope"), makeContext());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("undeliverable");
            expect(result.data.metadata.reason).toBe("Target not found");
        }
    });
});

function buildPeerDescriptor(
    peerId: string,
    knowledgeNodeId: string,
    endpoint: string,
): ContextPeerDescriptor {
    const exposed = createExposedKnowledgeDescriptor(
        knowledgeNodeId,
        "text",
        true,
        createKnowledgeQueryContract(["text"], false),
        createAccessPolicyDescriptor([], [], true, "empty-result"),
        [],
    );
    return createContextPeerDescriptor(
        `peer-desc:${peerId}`,
        peerId,
        endpoint,
        createAuthContract(["bearer-token"], false),
        [exposed],
        [],
    );
}

describe("MessageRouter — knowledge-source routes (M3)", () => {
    it("routes a peer-owned target to a knowledge-source route", () => {
        const router = createMessageRouter();
        const peers = createPeerRegistry([
            buildPeerDescriptor(
                "peer:remote",
                "knowledge:remote",
                "http://remote/gcp",
            ),
        ]);
        const message = createMessage("knowledge:remote");
        const result = router.route(message, {
            localNodeId: "node:local",
            connections: {} as unknown as RoutingContext["connections"],
            externalAgents: {
                getByNodeId: () => undefined,
            } as unknown as ExternalAgentRegistry,
            knowledgeSources: {} as unknown as KnowledgeSourceRegistry,
            peers,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("knowledge-source");
            expect(result.data.transportId).toBe("transport:http");
            expect(result.data.knowledgeSourceId).toBe("peer:remote");
            expect(result.data.metadata["gcp.peerEndpoint"]).toBe(
                "http://remote/gcp",
            );
        }
    });

    it("still returns undeliverable for an unknown target with no peer", () => {
        const router = createMessageRouter();
        const message = createMessage("knowledge:nobody");
        const result = router.route(message, {
            localNodeId: "node:local",
            connections: {} as unknown as RoutingContext["connections"],
            externalAgents: {
                getByNodeId: () => undefined,
            } as unknown as ExternalAgentRegistry,
            knowledgeSources: {} as unknown as KnowledgeSourceRegistry,
            peers: createPeerRegistry(),
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("undeliverable");
        }
    });
});
