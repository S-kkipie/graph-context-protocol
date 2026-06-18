import {
    type ContextPeerDescriptor,
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createPeerRegistry } from "./implementation";

function peer(peerId: string, knowledgeNodeId: string): ContextPeerDescriptor {
    const exposed = createExposedKnowledgeDescriptor(
        knowledgeNodeId,
        "text",
        true,
        createKnowledgeQueryContract(["text"], false),
        createAccessPolicyDescriptor([], [], true, "empty-result"),
        ["tasks"],
    );
    return createContextPeerDescriptor(
        `peer-desc:${peerId}`,
        peerId,
        `http://${peerId}/gcp`,
        createAuthContract(["bearer-token"], false),
        [exposed],
        [],
    );
}

describe("createPeerRegistry", () => {
    it("starts empty", () => {
        expect(createPeerRegistry().list()).toEqual([]);
        expect(createPeerRegistry().snapshot().totalPeers).toBe(0);
    });

    it("registers and looks up peers immutably", () => {
        const base = createPeerRegistry();
        const next = base.register(peer("p1", "knowledge:a"));
        expect(next.success).toBe(true);
        // original registry unchanged (copy-on-write)
        expect(base.list()).toHaveLength(0);
        if (next.success) {
            expect(next.data.list()).toHaveLength(1);
            expect(next.data.get("p1")?.peerId).toBe("p1");
            expect(next.data.snapshot().totalPeers).toBe(1);
        }
    });

    it("resolves a peer by the knowledge node id it exposes", () => {
        const seeded = createPeerRegistry([
            peer("p1", "knowledge:a"),
            peer("p2", "knowledge:b"),
        ]);
        expect(seeded.getByKnowledgeNodeId("knowledge:b")?.peerId).toBe("p2");
        expect(
            seeded.getByKnowledgeNodeId("knowledge:missing"),
        ).toBeUndefined();
    });

    it("unregisters immutably", () => {
        const seeded = createPeerRegistry([peer("p1", "knowledge:a")]);
        const removed = seeded.unregister("p1");
        expect(removed.success).toBe(true);
        if (removed.success) {
            expect(removed.data.list()).toHaveLength(0);
        }
        expect(seeded.list()).toHaveLength(1);
    });
});
