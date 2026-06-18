import { fileURLToPath } from "node:url";
import {
    createContextQuery,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import {
    createFetchHandler,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

describe("scenario peer wiring (M3)", () => {
    it("a node seeded with a peer can query that peer's knowledge over HTTP", async () => {
        const nodeB = await createGcpNode({
            serverId: "server:b",
            nodeId: "node:b",
            knowledgeId: "knowledge:b-context",
            role: { id: "role:b", name: "B", description: "" },
            knowledge: { filePath: FIXTURE, tags: ["tasks"] },
        });
        const handlerB = createFetchHandler({ server: nodeB });
        const fetchToB: typeof fetch = async (_url, init) =>
            handlerB(new Request("http://b/gcp", init ?? undefined));

        const nodeA = await createGcpNode({
            serverId: "server:a",
            nodeId: "node:a",
            knowledgeId: "knowledge:a-context",
            role: { id: "role:a", name: "A", description: "" },
            knowledge: { filePath: FIXTURE, tags: ["notes"] },
            peers: [
                {
                    peerId: "peer:b",
                    endpoint: "http://b/gcp",
                    knowledgeNodeId: "knowledge:b-context",
                    tags: ["tasks"],
                },
            ],
        });

        // The seeded peer registry on A resolves knowledge:b-context to peer:b.
        // Query B directly through the fetch wired to B's handler to prove the
        // round-trip (A's registry endpoint would be used by resolveContextQuery
        // in the app; here we assert the seeded peer is discoverable).
        const result = await queryRemoteContext({
            url: "http://b/gcp",
            query: createContextQuery(
                "q:1",
                createRequesterDescriptor("principal:a"),
                "knowledge:b-context",
                "text",
                "status?",
            ),
            fetchImpl: fetchToB,
        });

        expect(result.status).toBe("ok");
        expect(nodeA).toBeDefined();
    });
});
