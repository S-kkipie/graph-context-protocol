import { describe, expect, it } from "vitest";
import { createKnowledgeNode } from "../graph";
import { createRole, SystemCapabilities } from "../role";
import {
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createExposedKnowledgeDescriptorFromNode,
    createKnowledgeQueryContract,
    createSourceOfTruthDescriptor,
} from "./context-contract-factories";
import type {
    AccessPolicyDescriptor,
    AuthContract,
    ExposedKnowledgeDescriptor,
    KnowledgeQueryContract,
} from "./context-contract-types";
import {
    ContractVersion,
    createMetadataWithAccessPolicy,
    GCP_ACCESS_POLICY_METADATA_KEY,
    parseAccessPolicyFromMetadata,
} from "./context-contract-types";
import {
    discoverPeerContextSources,
    filterExposedKnowledge,
    filterExposedKnowledgeByCapability,
    filterExposedKnowledgeByQueryMode,
    filterExposedKnowledgeByRole,
    filterExposedKnowledgeByTags,
    filterPeersByCapability,
    filterPeersByKnowledgeTags,
    filterPeersByQueryable,
} from "./peer-discovery";

describe("context contract descriptors", () => {
    const auth = createAuthContract(
        ["bearer-token", "api-key"],
        true,
        ["role:developer"],
        [SystemCapabilities.QUERY_REMOTE_CONTEXT],
        { issuer: "local" },
    );
    const queryContract = createKnowledgeQueryContract(
        ["text", "structured"],
        true,
        ["since", "tag"],
        { maxQueryLength: 500, timeoutMs: 1000 },
    );
    const access = createAccessPolicyDescriptor(
        ["role:developer", "role:ceo"],
        [SystemCapabilities.QUERY_REMOTE_CONTEXT],
        false,
        "error",
        { policy: "owner-local" },
    );

    it("creates auth contracts with schemes and optional role/capability hints", () => {
        expect(auth.schemes).toEqual(["bearer-token", "api-key"]);
        expect(auth.required).toBe(true);
        expect(auth.acceptedRoles).toEqual(["role:developer"]);
        expect(auth.requiredCapabilities).toEqual([
            SystemCapabilities.QUERY_REMOTE_CONTEXT,
        ]);
    });

    it("rejects invalid auth schemes", () => {
        expect(() => createAuthContract(["bad" as never], true)).toThrow();
    });

    it("creates query contracts with supported modes and filters", () => {
        expect(queryContract.modes).toEqual(["text", "structured"]);
        expect(queryContract.supportsFilters).toBe(true);
        expect(queryContract.supportedFilters).toEqual(["since", "tag"]);
        expect(queryContract.maxQueryLength).toBe(500);
    });

    it("rejects empty query mode contracts", () => {
        expect(() => createKnowledgeQueryContract([], true)).toThrow();
    });

    it("creates access policies with fallback and denial mode", () => {
        const policy = createAccessPolicyDescriptor(
            ["role:external-agent"],
            [],
            true,
            "fallback-if-allowed",
        );

        expect(policy.readableByRoles).toEqual(["role:external-agent"]);
        expect(policy.requiredCapabilities).toEqual([]);
        expect(policy.fallbackAllowed).toBe(true);
        expect(policy.denialMode).toBe("fallback-if-allowed");
    });

    it("rejects invalid denial modes", () => {
        expect(() =>
            createAccessPolicyDescriptor([], [], false, "invalid" as never),
        ).toThrow();
    });

    it("stores and parses access policy from stable metadata key", () => {
        const metadata = createMetadataWithAccessPolicy(access, {
            public: true,
        });
        const parsed = parseAccessPolicyFromMetadata(metadata);

        expect(metadata.public).toBe(true);
        expect(metadata[GCP_ACCESS_POLICY_METADATA_KEY]).toEqual(access);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.readableByRoles).toEqual([
                "role:developer",
                "role:ceo",
            ]);
        }
    });

    it("returns parse errors for missing or invalid access policy metadata", () => {
        expect(parseAccessPolicyFromMetadata({}).success).toBe(false);
        expect(
            parseAccessPolicyFromMetadata({
                [GCP_ACCESS_POLICY_METADATA_KEY]: { readableByRoles: "bad" },
            }).success,
        ).toBe(false);
    });

    it("creates source-of-truth descriptors without replacing direction shape", () => {
        const source = createSourceOfTruthDescriptor(
            "agent:owner",
            "issues-db",
            "Owner-side issue database",
        );

        expect(source.ownerId).toBe("agent:owner");
        expect(source.sourceId).toBe("issues-db");
    });

    it("creates exposed knowledge descriptors matching direction shape", () => {
        const descriptor = createExposedKnowledgeDescriptor(
            "knowledge:events",
            "events",
            true,
            queryContract,
            access,
            ["events", "today"],
            ["application/json"],
            { sourceOfTruth: { ownerId: "agent:b", sourceId: "events-log" } },
        );

        expect(descriptor.nodeId).toBe("knowledge:events");
        expect(descriptor.kind).toBe("knowledge");
        expect(descriptor.knowledgeType).toBe("events");
        expect(descriptor.queryable).toBe(true);
        expect(descriptor.queryContract.modes).toEqual(["text", "structured"]);
        expect(descriptor.access.readableByRoles).toContain("role:developer");
        expect(descriptor.contentTypes).toEqual(["application/json"]);
    });

    it("sanitizes private metadata in exposed knowledge descriptors", () => {
        const descriptor = createExposedKnowledgeDescriptor(
            "knowledge:private",
            "documents",
            true,
            queryContract,
            access,
            ["docs"],
            ["text/markdown"],
            {
                contentType: "text/markdown",
                content: "secret body",
                apiKey: "secret-key",
                token: "secret-token",
            },
        );

        expect(descriptor.metadata.contentType).toBe("text/markdown");
        expect(descriptor.metadata.content).toBeUndefined();
        expect(descriptor.metadata.apiKey).toBeUndefined();
        expect(descriptor.metadata.token).toBeUndefined();
    });

    it("derives exposed knowledge descriptors from knowledge nodes", () => {
        const role = createRole("role:test", "Test", "Test role");
        const node = createKnowledgeNode("knowledge:events", role, {
            tags: ["events"],
            contentType: "application/json",
            eventPayload: { private: true },
        });

        const descriptor = createExposedKnowledgeDescriptorFromNode(
            node,
            "events",
            true,
            queryContract,
            access,
        );

        expect(descriptor.nodeId).toBe("knowledge:events");
        expect(descriptor.tags).toEqual(["events"]);
        expect(descriptor.contentTypes).toEqual(["application/json"]);
        expect(descriptor.metadata.eventPayload).toBeUndefined();
    });

    it("creates peer descriptors with endpoint and safe metadata", () => {
        const knowledge = createExposedKnowledgeDescriptor(
            "knowledge:events",
            "events",
            true,
            queryContract,
            access,
            ["events"],
            ["application/json"],
        );
        const peer = createContextPeerDescriptor(
            "descriptor:node-b",
            "peer:node-b",
            "http://localhost:5201",
            auth,
            [knowledge],
            [SystemCapabilities.QUERY_REMOTE_CONTEXT],
            {
                graphId: "graph:node-b",
                displayName: "Node B",
                queryEndpoint: "/gcp/context/query",
                metadata: { token: "secret", public: "ok" },
            },
        );

        expect(peer.version).toBe(ContractVersion);
        expect(peer.id).toBe("descriptor:node-b");
        expect(peer.peerId).toBe("peer:node-b");
        expect(peer.endpoint).toBe("http://localhost:5201");
        expect(peer.graphId).toBe("graph:node-b");
        expect(peer.queryEndpoint).toBe("/gcp/context/query");
        expect(peer.metadata.public).toBe("ok");
        expect(peer.metadata.token).toBeUndefined();
    });
});

describe("peer descriptor discovery", () => {
    const auth: AuthContract = createAuthContract(["api-key"], true);
    const queryContract: KnowledgeQueryContract = createKnowledgeQueryContract(
        ["text", "semantic"],
        true,
        ["tag"],
    );
    const structuredContract: KnowledgeQueryContract =
        createKnowledgeQueryContract(["structured"], true, ["since"]);
    const readerAccess: AccessPolicyDescriptor = createAccessPolicyDescriptor(
        ["role:reader"],
        [SystemCapabilities.QUERY_REMOTE_CONTEXT],
        false,
        "error",
    );
    const adminAccess: AccessPolicyDescriptor = createAccessPolicyDescriptor(
        ["role:admin"],
        [SystemCapabilities.READ_CONTEXT],
        false,
        "empty-result",
    );

    const knowledge: readonly ExposedKnowledgeDescriptor[] = [
        createExposedKnowledgeDescriptor(
            "knowledge:docs",
            "documents",
            true,
            queryContract,
            readerAccess,
            ["api", "docs"],
            ["text/markdown"],
        ),
        createExposedKnowledgeDescriptor(
            "knowledge:events",
            "events",
            true,
            structuredContract,
            adminAccess,
            ["events"],
            ["application/json"],
        ),
        createExposedKnowledgeDescriptor(
            "knowledge:hidden",
            "logs",
            false,
            queryContract,
            readerAccess,
            ["logs"],
            ["application/json"],
        ),
    ];

    const peers = [
        createContextPeerDescriptor(
            "descriptor:one",
            "peer:one",
            "http://one.local",
            auth,
            [knowledge[0], knowledge[2]],
            [SystemCapabilities.QUERY_REMOTE_CONTEXT],
        ),
        createContextPeerDescriptor(
            "descriptor:two",
            "peer:two",
            "http://two.local",
            auth,
            [knowledge[1]],
            [SystemCapabilities.DISCOVER_PEERS],
        ),
    ];

    it("filters exposed knowledge by role and capability", () => {
        expect(
            filterExposedKnowledgeByRole(knowledge, "role:reader"),
        ).toHaveLength(2);
        expect(
            filterExposedKnowledgeByCapability(
                knowledge,
                SystemCapabilities.QUERY_REMOTE_CONTEXT,
            ).map((item) => item.nodeId),
        ).toEqual(["knowledge:docs", "knowledge:hidden"]);
    });

    it("filters exposed knowledge by tags and query mode", () => {
        expect(filterExposedKnowledgeByTags(knowledge, ["api"])).toHaveLength(
            1,
        );
        expect(
            filterExposedKnowledgeByQueryMode(knowledge, "structured"),
        ).toHaveLength(1);
    });

    it("filters by queryable only when requested", () => {
        expect(filterExposedKnowledge(knowledge)).toHaveLength(3);
        expect(
            filterExposedKnowledge(knowledge, { queryable: true }),
        ).toHaveLength(2);
        expect(
            filterExposedKnowledge(knowledge, { queryable: false }),
        ).toHaveLength(1);
    });

    it("filters exposed knowledge by multiple criteria", () => {
        const result = filterExposedKnowledge(knowledge, {
            roleId: "role:reader",
            tags: ["api"],
            queryMode: "text",
            queryable: true,
        });

        expect(result.map((item) => item.nodeId)).toEqual(["knowledge:docs"]);
    });

    it("filters peers by capability, tags, and queryability", () => {
        expect(
            filterPeersByCapability(
                peers,
                SystemCapabilities.DISCOVER_PEERS,
            ).map((peer) => peer.peerId),
        ).toEqual(["peer:two"]);
        expect(filterPeersByKnowledgeTags(peers, ["api"])).toHaveLength(1);
        expect(filterPeersByQueryable(peers, "structured")).toHaveLength(1);
    });

    it("discovers peer context sources without a global graph", () => {
        const result = discoverPeerContextSources(peers, {
            capability: SystemCapabilities.DISCOVER_PEERS,
            tags: ["events"],
            queryMode: "structured",
        });

        expect(result.map((peer) => peer.peerId)).toEqual(["peer:two"]);
    });
});
