import { fileURLToPath } from "node:url";
import {
    createAccessPolicyDescriptor,
    createMetadataWithAccessPolicy,
    GCP_ACCESS_POLICY_METADATA_KEY,
    parseAccessPolicyFromMetadata,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createGcpNode, resolveGraphId } from "./gcp-node";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

const baseConfig = {
    serverId: "server:test",
    nodeId: "node:test",
    knowledgeId: "knowledge:test-context",
    role: {
        id: "role:test-context",
        name: "Test Context",
        description: "Test node",
    },
    accessPolicy: {
        fallbackAllowed: true,
        denialMode: "empty-result" as const,
    },
    knowledge: { filePath: FIXTURE, tags: ["tasks", "notes"] },
};

describe("createGcpNode", () => {
    it("builds and starts a server with the configured id and node id", async () => {
        const server = await createGcpNode(baseConfig);
        expect(server.id).toBe("server:test");
        expect(server.localNodeId).toBe("node:test");
        expect(server.status).toBe("ready");
    });

    it("exposes the configured local node id after starting", async () => {
        const server = await createGcpNode(baseConfig);
        const snapshot = server.snapshot();
        expect(snapshot.localNodeId).toBe("node:test");
    });

    it("applies schema defaults (graphId, denialMode) when omitted", async () => {
        const server = await createGcpNode({
            serverId: "server:defaults",
            nodeId: "node:defaults",
            knowledgeId: "knowledge:defaults",
            role: { id: "role:d", name: "D", description: "d" },
            knowledge: { filePath: FIXTURE },
        });
        expect(server.status).toBe("ready");
    });

    it("throws a descriptive error when the access policy is invalid", async () => {
        await expect(
            createGcpNode({
                ...baseConfig,
                // @ts-expect-error invalid denialMode on purpose
                accessPolicy: { denialMode: "nonsense" },
            }),
        ).rejects.toThrow();
    });

    it("round-trips the factory's metadata-construction path via core helpers", () => {
        const policy = createAccessPolicyDescriptor(
            [],
            [],
            true,
            "empty-result",
        );
        const metadata = createMetadataWithAccessPolicy(policy, {
            tags: ["tasks"],
            contentType: "text/markdown",
        });
        expect(metadata[GCP_ACCESS_POLICY_METADATA_KEY]).toBeDefined();
        const parsed = parseAccessPolicyFromMetadata(metadata);
        expect(parsed.success).toBe(true);
    });
});

describe("resolveGraphId", () => {
    it("uses the explicit graphId when provided", () => {
        expect(resolveGraphId("node:x", "graph:custom")).toBe("graph:custom");
    });
    it("derives graph:<suffix> stripping a leading node: prefix", () => {
        expect(resolveGraphId("node:researcher")).toBe("graph:researcher");
    });
    it("derives graph:<id> for an id without a node: prefix", () => {
        expect(resolveGraphId("researcher")).toBe("graph:researcher");
    });
});
