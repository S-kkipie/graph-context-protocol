import { describe, expect, it } from "vitest";
import type { GraphNode } from "../graph/types";
import type { RoleDefinition } from "../role/types";
import {
    createContext,
    createContextFilter,
    propagateContext,
    validateContext,
} from "./index";
import type { ContextData } from "./types";

// Mock role with specific context rules
const createMockRole = (
    contextRules: RoleDefinition["contextRules"],
): RoleDefinition => ({
    id: "role:test",
    name: "Test Role",
    description: "A test role",
    capabilities: [],
    contextRules,
    metadata: {},
    hasCapability: () => false,
    getEffectiveContextRules: () => contextRules,
});

// Mock node with specific role
const createMockNode = (
    role: RoleDefinition,
    id = "node:target",
): GraphNode => ({
    id,
    kind: "generic",
    role,
    metadata: {},
    createdAt: new Date().toISOString(),
    withRole: () => createMockNode(role, id),
    withMetadata: () => createMockNode(role, id),
});

describe("context module", () => {
    describe("createContext", () => {
        it("should create a context with all required fields", () => {
            const role = createMockRole([]);
            const data: ContextData = { key: "value" };

            const context = createContext(
                "ctx:1",
                "graph:1",
                "node:start",
                role,
                data,
                { meta: "data" },
            );

            expect(context.id).toBe("ctx:1");
            expect(context.graphId).toBe("graph:1");
            expect(context.currentNode).toBe("node:start");
            expect(context.role).toBe(role);
            expect(context.accumulatedData).toEqual(data);
            expect(context.metadata).toEqual({ meta: "data" });
            expect(context.createdAt).toBeDefined();
            expect(context.path).toEqual(["node:start"]);
        });

        it("should default data to empty object", () => {
            const role = createMockRole([]);
            const context = createContext("ctx:1", "graph:1", "node:1", role);
            expect(context.accumulatedData).toEqual({});
        });

        it("should default metadata to empty object", () => {
            const role = createMockRole([]);
            const context = createContext("ctx:1", "graph:1", "node:1", role);
            expect(context.metadata).toEqual({});
        });
    });

    describe("createContextFilter", () => {
        it("should create an include filter", () => {
            const filter = createContextFilter("field", "include", "value");
            expect(filter.field).toBe("field");
            expect(filter.operation).toBe("include");
            expect(filter.value).toBe("value");
        });

        it("should create an exclude filter", () => {
            const filter = createContextFilter("field", "exclude");
            expect(filter.field).toBe("field");
            expect(filter.operation).toBe("exclude");
            expect(filter.value).toBeUndefined();
        });

        it("should create a transform filter", () => {
            const transformFn = (x: unknown) => x;
            const filter = createContextFilter(
                "field",
                "transform",
                transformFn,
            );
            expect(filter.field).toBe("field");
            expect(filter.operation).toBe("transform");
            expect(filter.value).toBe(transformFn);
        });
    });

    describe("propagateContext", () => {
        it("should succeed when target role has readable access to context data", () => {
            const sourceRole = createMockRole([]);
            const targetRole = createMockRole([
                { path: "user.name", access: "read" },
            ]);
            const targetNode = createMockNode(targetRole, "node:target");

            const context = createContext(
                "ctx:1",
                "graph:1",
                "node:source",
                sourceRole,
                { "user.name": "John" },
            );

            const result = propagateContext(context, targetNode);

            expect(result.success).toBe(true);
            expect(result.sourceContext).toBe(context);
            expect(result.targetNode).toBe(targetNode);
            expect(result.propagatedContext.currentNode).toBe("node:target");
            expect(result.propagatedContext.path).toEqual([
                "node:source",
                "node:target",
            ]);
        });

        it("should succeed when target role has writable access to context data", () => {
            const sourceRole = createMockRole([]);
            const targetRole = createMockRole([
                { path: "data", access: "write" },
            ]);
            const targetNode = createMockNode(targetRole, "node:target");

            const context = createContext(
                "ctx:1",
                "graph:1",
                "node:source",
                sourceRole,
                { data: "value" },
            );

            const result = propagateContext(context, targetNode);
            expect(result.success).toBe(true);
        });

        it("should fail when target role has 'none' access to context data", () => {
            const sourceRole = createMockRole([]);
            const targetRole = createMockRole([
                { path: "secret", access: "none" },
            ]);
            const targetNode = createMockNode(targetRole, "node:target");

            const context = createContext(
                "ctx:1",
                "graph:1",
                "node:source",
                sourceRole,
                { secret: "value" },
            );

            const result = propagateContext(context, targetNode);

            expect(result.success).toBe(false);
            expect(result.error).toBe(
                "Target node does not have access to context data",
            );
        });

        it("should fail when target role has no matching context rules", () => {
            const sourceRole = createMockRole([]);
            const targetRole = createMockRole([
                { path: "other", access: "read" },
            ]);
            const targetNode = createMockNode(targetRole, "node:target");

            const context = createContext(
                "ctx:1",
                "graph:1",
                "node:source",
                sourceRole,
                { different: "data" },
            );

            const result = propagateContext(context, targetNode);
            expect(result.success).toBe(false);
        });

        it("should apply exclude filters to remove fields", () => {
            const sourceRole = createMockRole([]);
            const targetRole = createMockRole([
                { path: "keep", access: "read" },
                { path: "remove", access: "read" },
            ]);
            const targetNode = createMockNode(targetRole, "node:target");

            const context = createContext(
                "ctx:1",
                "graph:1",
                "node:source",
                sourceRole,
                { keep: "this", remove: "that" },
            );

            const filter = createContextFilter("remove", "exclude");
            const result = propagateContext(context, targetNode, [filter]);

            expect(result.success).toBe(true);
            expect(result.propagatedContext.accumulatedData).toEqual({
                keep: "this",
            });
            expect(result.filtersApplied).toContain(filter);
        });
    });

    describe("validateContext", () => {
        it("should return true for valid context", () => {
            const role = createMockRole([{ path: "data", access: "read" }]);
            const context = createContext("ctx:1", "graph:1", "node:1", role, {
                data: "value",
            });

            expect(validateContext(context)).toBe(true);
        });

        it("should return false when context has data blocked by 'none' rule", () => {
            const role = createMockRole([
                { path: "allowed", access: "read" },
                { path: "blocked", access: "none" },
            ]);
            const context = createContext("ctx:1", "graph:1", "node:1", role, {
                allowed: "yes",
                blocked: "no",
            });

            expect(validateContext(context)).toBe(false);
        });

        it("should return true when 'none' rule has no matching data", () => {
            const role = createMockRole([{ path: "blocked", access: "none" }]);
            const context = createContext("ctx:1", "graph:1", "node:1", role, {
                other: "data",
            });

            expect(validateContext(context)).toBe(true);
        });

        it("should return true when role has no context rules", () => {
            const role = createMockRole([]);
            const context = createContext("ctx:1", "graph:1", "node:1", role, {
                any: "data",
            });

            expect(validateContext(context)).toBe(true);
        });
    });
});
