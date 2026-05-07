import { describe, expect, it } from "vitest";
import type { RoleDefinition } from "../role/types";
import { createEdge, createNode, EdgeTypeSchema } from "./index";

// Mock role for testing
const mockRole: RoleDefinition = {
    id: "role:test",
    name: "Test Role",
    description: "A test role",
    capabilities: [],
    contextRules: [],
    metadata: {},
    hasCapability: () => false,
    getEffectiveContextRules: () => [],
};

describe("graph module", () => {
    describe("EdgeTypeSchema", () => {
        it("should validate known edge types", () => {
            expect(EdgeTypeSchema.parse("can-access")).toBe("can-access");
            expect(EdgeTypeSchema.parse("can-modify")).toBe("can-modify");
            expect(EdgeTypeSchema.parse("can-traverse")).toBe("can-traverse");
            expect(EdgeTypeSchema.parse("depends-on")).toBe("depends-on");
            expect(EdgeTypeSchema.parse("notifies")).toBe("notifies");
            expect(EdgeTypeSchema.parse("custom")).toBe("custom");
        });

        it("should reject unknown edge types", () => {
            expect(() => EdgeTypeSchema.parse("unknown")).toThrow();
            expect(() => EdgeTypeSchema.parse("invalid")).toThrow();
        });
    });

    describe("createNode", () => {
        it("should create a node with valid inputs", () => {
            const node = createNode("node-1", mockRole, { key: "value" });

            expect(node.id).toBe("node-1");
            expect(node.role).toBe(mockRole);
            expect(node.metadata).toEqual({ key: "value" });
            expect(node.createdAt).toBeDefined();
            expect(typeof node.createdAt).toBe("string");
        });

        it("should default metadata to empty object", () => {
            const node = createNode("node-2", mockRole);
            expect(node.metadata).toEqual({});
        });

        it("should reject empty id", () => {
            expect(() => createNode("", mockRole)).toThrow();
        });

        it("should create immutable nodes", () => {
            const node = createNode("node-3", mockRole);
            const originalMetadata = node.metadata;

            // Attempt to mutate (should not affect original)
            const newNode = node.withMetadata({ new: "data" });
            expect(node.metadata).toBe(originalMetadata);
            expect(newNode.metadata).toEqual({ new: "data" });
        });
    });

    describe("createNode.withRole", () => {
        it("should return a new node with the updated role", () => {
            const node = createNode("node-1", mockRole);
            const newRole: RoleDefinition = {
                ...mockRole,
                id: "role:new",
                name: "New Role",
            };

            const updatedNode = node.withRole(newRole);

            expect(updatedNode.id).toBe("node-1");
            expect(updatedNode.role).toBe(newRole);
            expect(updatedNode.metadata).toEqual(node.metadata);
            expect(updatedNode).not.toBe(node);
        });
    });

    describe("createNode.withMetadata", () => {
        it("should merge metadata immutably", () => {
            const node = createNode("node-1", mockRole, { original: "data" });
            const updatedNode = node.withMetadata({ new: "value" });

            expect(updatedNode.metadata).toEqual({
                original: "data",
                new: "value",
            });
            expect(node.metadata).toEqual({ original: "data" });
        });
    });

    describe("createEdge", () => {
        it("should create an edge with valid inputs", () => {
            const edge = createEdge(
                "edge-1",
                "node-a",
                "node-b",
                "can-access",
                { weight: 1 },
                true,
            );

            expect(edge.id).toBe("edge-1");
            expect(edge.source).toBe("node-a");
            expect(edge.target).toBe("node-b");
            expect(edge.type).toBe("can-access");
            expect(edge.metadata).toEqual({ weight: 1 });
            expect(edge.bidirectional).toBe(true);
            expect(edge.createdAt).toBeDefined();
        });

        it("should default metadata to empty object", () => {
            const edge = createEdge("edge-1", "node-a", "node-b", "depends-on");
            expect(edge.metadata).toEqual({});
        });

        it("should default bidirectional to false", () => {
            const edge = createEdge("edge-1", "node-a", "node-b", "notifies");
            expect(edge.bidirectional).toBe(false);
        });

        it("should reject invalid edge id", () => {
            expect(() =>
                createEdge("", "node-a", "node-b", "can-access"),
            ).toThrow();
        });

        it("should reject invalid source node id", () => {
            expect(() =>
                createEdge("edge-1", "", "node-b", "can-access"),
            ).toThrow();
        });

        it("should reject invalid target node id", () => {
            expect(() =>
                createEdge("edge-1", "node-a", "", "can-access"),
            ).toThrow();
        });

        it("should reject invalid edge type", () => {
            expect(() =>
                createEdge("edge-1", "node-a", "node-b", "invalid" as any),
            ).toThrow();
        });
    });
});
