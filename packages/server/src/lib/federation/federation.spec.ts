import {
    type ContextPeerDescriptor,
    type ContextQueryResult,
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createContextQuery,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { createCouplingMetrics } from "../metrics/implementation";
import { createPeerRegistry } from "../peers/implementation";
import { resolveContextQuery } from "./resolve";

function peer(peerId: string, knowledgeNodeId: string): ContextPeerDescriptor {
    return createContextPeerDescriptor(
        `peer-desc:${peerId}`,
        peerId,
        `http://${peerId}/gcp`,
        createAuthContract(["bearer-token"], false),
        [
            createExposedKnowledgeDescriptor(
                knowledgeNodeId,
                "text",
                true,
                createKnowledgeQueryContract(["text"], false),
                createAccessPolicyDescriptor([], [], true, "empty-result"),
            ),
        ],
        [],
    );
}

function query(targetNodeId: string) {
    return createContextQuery(
        `q:${targetNodeId}`,
        createRequesterDescriptor("principal:agent"),
        targetNodeId,
        "text",
        "status?",
    );
}

describe("resolveContextQuery", () => {
    it("handles a local target with the local handler (no peer contact)", async () => {
        const metrics = createCouplingMetrics();
        const localHandler = vi.fn(
            async (): Promise<ContextQueryResult> => ({
                contractVersion: "gcp-context-contract/v1",
                queryId: "q:local",
                status: "ok",
                sourceNodeId: "node:local",
                result: "local-answer",
                metadata: {},
            }),
        );

        const result = await resolveContextQuery({
            query: query("knowledge:local"),
            localNodeId: "node:local",
            isLocalTarget: (id) => id === "knowledge:local",
            peers: createPeerRegistry(),
            localHandler,
            metrics,
        });

        expect(result.status).toBe("ok");
        expect(localHandler).toHaveBeenCalledOnce();
        expect(metrics.snapshot().connectionsOpened).toBe(0);
        expect(metrics.snapshot().messagesSent).toBe(0);
    });

    it("contacts the owning peer for a remote target and records metrics", async () => {
        const metrics = createCouplingMetrics();
        const queryFn = vi.fn(
            async (): Promise<ContextQueryResult> => ({
                contractVersion: "gcp-context-contract/v1",
                queryId: "q:remote",
                status: "ok",
                sourceNodeId: "knowledge:remote",
                result: "peer-answer",
                metadata: {},
            }),
        ) as unknown as typeof import("../http/fetch-client").queryRemoteContext;

        const result = await resolveContextQuery({
            query: query("knowledge:remote"),
            localNodeId: "node:local",
            isLocalTarget: () => false,
            peers: createPeerRegistry([
                peer("peer:remote", "knowledge:remote"),
            ]),
            localHandler: async () => {
                throw new Error("should not be called");
            },
            metrics,
            queryFn,
        });

        expect(result.status).toBe("ok");
        expect(result.result).toBe("peer-answer");
        expect(metrics.snapshot().connectionsOpened).toBe(1);
        expect(metrics.snapshot().messagesSent).toBe(1);
        expect(metrics.snapshot().peersKnown).toBe(1);
        // queryFn was called against the peer endpoint
        const call = (queryFn as unknown as ReturnType<typeof vi.fn>).mock
            .calls[0][0];
        expect((call as { url: string }).url).toBe("http://peer:remote/gcp");
    });

    it("returns not-found when no peer owns the target", async () => {
        const result = await resolveContextQuery({
            query: query("knowledge:nobody"),
            localNodeId: "node:local",
            isLocalTarget: () => false,
            peers: createPeerRegistry(),
            localHandler: async () => {
                throw new Error("should not be called");
            },
        });
        expect(result.status).toBe("not-found");
    });
});
