import {
    createAccessPolicyDescriptor,
    createCapability,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
    type GraphNode,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createAllowAllAuthProvider } from "./implementation";
import { authorizeKnowledgeNodeAccess } from "./node-authorization";
import type { AuthProvider, Principal } from "./types";

const viewerRole = createRole(
    "role:viewer",
    "Viewer",
    "Can view public nodes",
    [
        createCapability(
            "cap:read-public",
            "Read Public",
            "Can read public knowledge",
        ),
    ],
);

const ceoRole = createRole("role:ceo", "CEO", "Full access", [
    createCapability("cap:read-all", "Read All", "Can read all knowledge"),
    createCapability("cap:admin-access", "Admin Access", "Admin capabilities"),
]);

const developerRole = createRole(
    "role:developer",
    "Developer",
    "Developer access",
    [
        createCapability(
            "cap:read-internal",
            "Read Internal",
            "Can read internal docs",
        ),
    ],
);

const externalRole = createRole(
    "role:external",
    "External",
    "External access",
    [createCapability("cap:read-public", "Read Public", "Can read public")],
);

const ceoPrincipal: Principal = {
    id: "principal:ceo",
    role: ceoRole,
    capabilities: [],
    metadata: {},
};

const developerPrincipal: Principal = {
    id: "principal:developer",
    role: developerRole,
    capabilities: ["cap:read-internal"],
    metadata: {},
};

const externalPrincipal: Principal = {
    id: "principal:external",
    role: externalRole,
    capabilities: ["cap:read-public"],
    metadata: {},
};

const noCapPrincipal: Principal = {
    id: "principal:nocap",
    capabilities: [],
    metadata: {},
};

function createKnowledgeNodeWithPolicy(
    nodeId: string,
    readableByRoles: readonly string[],
    requiredCapabilities: readonly string[] = [],
    fallbackAllowed = false,
): GraphNode {
    const policy = createAccessPolicyDescriptor(
        readableByRoles,
        requiredCapabilities,
        fallbackAllowed,
        "error",
    );
    const metadata = createMetadataWithAccessPolicy(policy);
    const role = createRole("role:node-owner", "Node Owner", "Node owner");
    return createKnowledgeNode(nodeId, role, {
        tags: ["test"],
        contentType: "text/plain",
        ...metadata,
    });
}

const allowAll = createAllowAllAuthProvider();

describe("node-authorization", () => {
    describe("authorizeKnowledgeNodeAccess", () => {
        it("should allow CEO when role is in readableByRoles", () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:ceo",
            ]);

            const result = authorizeKnowledgeNodeAccess(
                ceoPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(true);
        });

        it("should allow developer when role is in readableByRoles", () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:developer",
                "role:ceo",
            ]);

            const result = authorizeKnowledgeNodeAccess(
                developerPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(true);
        });

        it("should deny external user when role is not in readableByRoles", () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:ceo",
                "role:developer",
            ]);

            const result = authorizeKnowledgeNodeAccess(
                externalPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("authorization-error");
                expect(result.error.message).toContain(
                    '"role:external" is not in readableByRoles',
                );
            }
        });

        it("should deny when principal is missing a required capability", () => {
            const node = createKnowledgeNodeWithPolicy(
                "knowledge:1",
                ["role:developer"],
                ["cap:admin-access"],
            );

            const result = authorizeKnowledgeNodeAccess(
                developerPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("authorization-error");
                expect(result.error.message).toContain(
                    "Missing required capabilities",
                );
                expect(result.error.metadata?.missingCapabilities).toContain(
                    "cap:admin-access",
                );
            }
        });

        it("should allow when all required capabilities are present (direct)", () => {
            const node = createKnowledgeNodeWithPolicy(
                "knowledge:1",
                ["role:developer"],
                ["cap:read-internal"],
            );

            const result = authorizeKnowledgeNodeAccess(
                developerPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(true);
        });

        it("should allow when required capabilities are on the role", () => {
            const node = createKnowledgeNodeWithPolicy(
                "knowledge:1",
                ["role:ceo"],
                ["cap:read-all"],
            );

            const result = authorizeKnowledgeNodeAccess(
                ceoPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(true);
        });

        it("should deny when node kind is not knowledge", () => {
            const agentNode = {
                id: "agent:1",
                kind: "agent",
                role: ceoRole,
                metadata: {},
                createdAt: new Date().toISOString(),
                withRole: () => agentNode,
                withMetadata: () => agentNode,
            } as GraphNode;

            const result = authorizeKnowledgeNodeAccess(
                ceoPrincipal,
                agentNode,
                allowAll,
            );

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("authorization-error");
                expect(result.error.message).toContain("not a knowledge node");
            }
        });

        it("should deny when access policy is missing from metadata", () => {
            const role = createRole("role:owner", "Owner", "Owner");
            const node = createKnowledgeNode("knowledge:1", role);

            const result = authorizeKnowledgeNodeAccess(
                ceoPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("authorization-error");
                expect(result.error.message).toContain(
                    "Missing or invalid access policy",
                );
            }
        });

        it("should deny when auth provider denies the request", () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", [
                "role:ceo",
            ]);

            const denyingProvider: AuthProvider = {
                authenticate: allowAll.authenticate,
                authorize: () => ({
                    success: true,
                    data: {
                        allowed: false,
                        reason: "Provider-level block",
                    },
                }),
            };

            const result = authorizeKnowledgeNodeAccess(
                ceoPrincipal,
                node,
                denyingProvider,
            );

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("authorization-error");
                expect(result.error.message).toContain("Provider-level block");
            }
        });

        it("should allow principal without a role when no readableByRoles", () => {
            const node = createKnowledgeNodeWithPolicy("knowledge:1", []);

            const result = authorizeKnowledgeNodeAccess(
                noCapPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(true);
        });

        it("should deny principal without a role when readableByRoles is not empty", () => {
            const node = createKnowledgeNodeWithPolicy(
                "knowledge:1",
                ["role:developer"],
                ["cap:query-remote-context"],
            );
            const rolelessPrincipal: Principal = {
                id: "principal:roleless",
                capabilities: ["cap:query-remote-context"],
                metadata: {},
            };

            const result = authorizeKnowledgeNodeAccess(
                rolelessPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("authorization-error");
                expect(result.error.message).toContain("missing a role");
            }
        });

        it("should deny when access policy has invalid format", () => {
            const role = createRole("role:owner", "Owner", "Owner");
            const node = createKnowledgeNode("knowledge:1", role, {
                "gcp.accessPolicy": { not: "valid" },
                tags: ["test"],
                contentType: "text/plain",
            });

            const result = authorizeKnowledgeNodeAccess(
                ceoPrincipal,
                node,
                allowAll,
            );

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("authorization-error");
                expect(result.error.message).toContain(
                    "Missing or invalid access policy",
                );
            }
        });
    });
});
