import { describe, expect, it } from "vitest";
import type { RoleDefinition } from "../role/types";
import {
    BuiltInEdgeTypeSchema,
    CustomEdge,
    createEdge,
    createNode,
    deserializeEdge,
    EdgeTypeSchema,
    serializeEdge,
} from "./index";

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

        it("should accept any string as extensible edge type", () => {
            expect(EdgeTypeSchema.parse("unknown")).toBe("unknown");
            expect(EdgeTypeSchema.parse("my-custom-type")).toBe(
                "my-custom-type",
            );
        });

        it("should reject unknown types in BuiltInEdgeTypeSchema", () => {
            expect(() => BuiltInEdgeTypeSchema.parse("unknown")).toThrow();
            expect(() =>
                BuiltInEdgeTypeSchema.parse("my-custom-type"),
            ).toThrow();
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

        it("should create CustomEdge for custom edge types", () => {
            const edge = createEdge(
                "edge-1",
                "node-a",
                "node-b",
                "my-custom-type",
            );
            expect(edge).toBeInstanceOf(CustomEdge);
            expect(edge.type).toBe("my-custom-type");
            expect(edge.getEdgeType()).toBe("my-custom-type");
        });
    });

    describe("serializeEdge and deserializeEdge", () => {
        it("should serialize an edge to JSON", () => {
            const edge = createEdge(
                "edge-1",
                "node-a",
                "node-b",
                "can-access",
                { weight: 1 },
                true,
            );
            const serialized = serializeEdge(edge);

            expect(serialized.version).toBe(1);
            expect(serialized.id).toBe("edge-1");
            expect(serialized.source).toBe("node-a");
            expect(serialized.target).toBe("node-b");
            expect(serialized.type).toBe("can-access");
            expect(serialized.metadata).toEqual({ weight: 1 });
            expect(serialized.bidirectional).toBe(true);
            expect(serialized.createdAt).toBeDefined();
        });

        it("should deserialize and recreate the same edge", () => {
            const original = createEdge(
                "edge-1",
                "node-a",
                "node-b",
                "can-access",
                { weight: 1 },
            );
            const serialized = serializeEdge(original);
            const deserialized = deserializeEdge(serialized);

            expect(deserialized.id).toBe(original.id);
            expect(deserialized.source).toBe(original.source);
            expect(deserialized.target).toBe(original.target);
            expect(deserialized.type).toBe(original.type);
            expect(deserialized.metadata).toEqual(original.metadata);
            expect(deserialized.bidirectional).toBe(original.bidirectional);
        });

        it("should deserialize custom edge types", () => {
            const customEdge = createEdge(
                "edge-1",
                "node-a",
                "node-b",
                "my-custom-type",
            );
            const serialized = serializeEdge(customEdge);
            const deserialized = deserializeEdge(serialized);

            expect(deserialized).toBeInstanceOf(CustomEdge);
            expect(deserialized.type).toBe("my-custom-type");
        });

        it("should round-trip all built-in edge types", () => {
            const types = [
                "can-access",
                "can-modify",
                "can-traverse",
                "depends-on",
                "notifies",
            ] as const;

            for (const type of types) {
                const original = createEdge("edge-1", "node-a", "node-b", type);
                const serialized = serializeEdge(original);
                const deserialized = deserializeEdge(serialized);

                expect(deserialized.type).toBe(type);
                expect(deserialized.getEdgeType()).toBe(type);
            }
        });
    });
});
