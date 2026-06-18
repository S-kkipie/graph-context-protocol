import { fileURLToPath } from "node:url";
import type { ContextPeerDescriptor } from "@graph-context-protocol/core";
import {
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createContextQuery,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import {
    createCouplingMetrics,
    createFetchHandler,
    createPeerRegistry,
    queryRemoteContext,
    resolveContextQuery,
} from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

/**
 * Builds a ContextPeerDescriptor from the given identifiers using the same
 * factory sequence that gcp-node.ts uses when seeding the peer registry.
 */
function buildPeerDescriptor(
    peerId: string,
    knowledgeNodeId: string,
    url: string,
): ContextPeerDescriptor {
    return createContextPeerDescriptor(
        `peer-desc:${peerId}`,
        peerId,
        url,
        createAuthContract(["bearer-token"], false),
        [
            createExposedKnowledgeDescriptor(
                knowledgeNodeId,
                "text",
                true,
                createKnowledgeQueryContract(["text"], false),
                createAccessPolicyDescriptor([], [], true, "empty-result"),
                [],
            ),
        ],
        [],
    );
}

async function buildLeaf(i: number) {
    const server = await createGcpNode({
        serverId: `server:leaf-${i}`,
        nodeId: `node:leaf-${i}`,
        knowledgeId: `knowledge:leaf-${i}`,
        role: { id: `role:leaf-${i}`, name: `Leaf ${i}`, description: "" },
        knowledge: { filePath: FIXTURE, tags: ["tasks"] },
    });
    return {
        url: `http://leaf-${i}/gcp`,
        handler: createFetchHandler({ server }),
    };
}

function routerFetch(
    leaves: ReadonlyArray<{
        url: string;
        handler: (r: Request) => Promise<Response>;
    }>,
): typeof fetch {
    const byUrl = new Map(leaves.map((l) => [l.url, l.handler]));
    return (async (url, init) => {
        const handler = byUrl.get(String(url));
        if (!handler) throw new Error(`no in-process node for ${url}`);
        return handler(new Request(String(url), init ?? undefined));
    }) as typeof fetch;
}

describe("federated fan-out scaling (M3, in-process)", () => {
    it("resolves and queries across >=3 peers with no global graph", async () => {
        const leaves = await Promise.all([0, 1, 2].map(buildLeaf));
        const fetchImpl = routerFetch(leaves);
        const peers = createPeerRegistry(
            leaves.map((l, i) =>
                buildPeerDescriptor(
                    `peer:leaf-${i}`,
                    `knowledge:leaf-${i}`,
                    l.url,
                ),
            ),
        );
        const metrics = createCouplingMetrics();

        const results = await Promise.all(
            [0, 1, 2].map((i) =>
                resolveContextQuery({
                    query: createContextQuery(
                        `q:${i}`,
                        createRequesterDescriptor("principal:hub"),
                        `knowledge:leaf-${i}`,
                        "text",
                        "status?",
                    ),
                    localNodeId: "node:hub",
                    isLocalTarget: () => false,
                    peers,
                    localHandler: async () => {
                        throw new Error("no local target in this test");
                    },
                    metrics,
                    fetchImpl,
                }),
            ),
        );

        expect(results.every((r) => r.status === "ok")).toBe(true);
        expect(metrics.snapshot().connectionsOpened).toBe(3);
        expect(metrics.snapshot().messagesSent).toBe(3);
        expect(metrics.snapshot().peersKnown).toBe(3);
    });

    it("connection/message counts scale with N (5 vs 2)", async () => {
        async function sweep(n: number): Promise<number> {
            const leaves = await Promise.all(
                Array.from({ length: n }, (_v, i) => buildLeaf(i)),
            );
            const fetchImpl = routerFetch(leaves);
            const peers = createPeerRegistry(
                leaves.map((l, i) =>
                    buildPeerDescriptor(
                        `peer:leaf-${i}`,
                        `knowledge:leaf-${i}`,
                        l.url,
                    ),
                ),
            );
            const metrics = createCouplingMetrics();
            await Promise.all(
                Array.from({ length: n }, (_v, i) =>
                    resolveContextQuery({
                        query: createContextQuery(
                            `q:${i}`,
                            createRequesterDescriptor("principal:hub"),
                            `knowledge:leaf-${i}`,
                            "text",
                            "status?",
                        ),
                        localNodeId: "node:hub",
                        isLocalTarget: () => false,
                        peers,
                        localHandler: async () => {
                            throw new Error("no local target");
                        },
                        metrics,
                        fetchImpl,
                    }),
                ),
            );
            return metrics.snapshot().connectionsOpened;
        }

        const small = await sweep(2);
        const large = await sweep(5);
        expect(small).toBe(2);
        expect(large).toBe(5);
        expect(large).toBeGreaterThan(small);
    });
});

describe("real-HTTP parity (M3, 2 nodes)", () => {
    it("matches the in-process result over the createFetchHandler round-trip", async () => {
        const leaf = await buildLeaf(99);
        const fetchImpl = routerFetch([leaf]);
        const result = await queryRemoteContext({
            url: leaf.url,
            query: createContextQuery(
                "q:parity",
                createRequesterDescriptor("principal:hub"),
                "knowledge:leaf-99",
                "text",
                "status?",
            ),
            fetchImpl,
        });
        expect(result.status).toBe("ok");
    });
});
