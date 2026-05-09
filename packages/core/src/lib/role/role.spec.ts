import { describe, expect, it } from "vitest";
import {
    type Capability,
    type ContextRule,
    createCapability,
    createContextRule,
    createRole,
    SystemCapabilities,
    SystemRoles,
} from "./index";

describe("role module", () => {
    describe("createCapability", () => {
        it("should create a capability with valid inputs", () => {
            const cap = createCapability(
                "cap:test",
                "Test Capability",
                "A test capability",
                { key: "value" },
            );

            expect(cap.id).toBe("cap:test");
            expect(cap.name).toBe("Test Capability");
            expect(cap.description).toBe("A test capability");
            expect(cap.metadata).toEqual({ key: "value" });
        });

        it("should default metadata to empty object", () => {
            const cap = createCapability("cap:test", "Test", "Description");
            expect(cap.metadata).toEqual({});
        });

        it("should reject empty capability id", () => {
            expect(() => createCapability("", "Test", "Desc")).toThrow();
        });

        it("should reject empty name", () => {
            expect(() =>
                createCapability("cap:test", "", "Description"),
            ).toThrow();
        });
    });

    describe("createContextRule", () => {
        it("should create a context rule with valid inputs", () => {
            const rule = createContextRule("user.name", "read", ["condition1"]);

            expect(rule.path).toBe("user.name");
            expect(rule.access).toBe("read");
            expect(rule.conditions).toEqual(["condition1"]);
        });

        it("should accept 'write' access", () => {
            const rule = createContextRule("data", "write");
            expect(rule.access).toBe("write");
        });

        it("should accept 'none' access", () => {
            const rule = createContextRule("sensitive", "none");
            expect(rule.access).toBe("none");
        });

        it("should make conditions optional", () => {
            const rule = createContextRule("path", "read");
            expect(rule.conditions).toBeUndefined();
        });
    });

    describe("createRole", () => {
        it("should create a role with valid inputs", () => {
            const capabilities: Capability[] = [
                createCapability("cap:1", "Cap 1", "Desc"),
            ];
            const rules: ContextRule[] = [createContextRule("path", "read")];

            const role = createRole(
                "role:test",
                "Test Role",
                "A test role",
                capabilities,
                rules,
                "role:parent",
                { key: "value" },
            );

            expect(role.id).toBe("role:test");
            expect(role.name).toBe("Test Role");
            expect(role.description).toBe("A test role");
            expect(role.capabilities).toEqual(capabilities);
            expect(role.contextRules).toEqual(rules);
            expect(role.parentRole).toBe("role:parent");
            expect(role.metadata).toEqual({ key: "value" });
        });

        it("should default capabilities to empty array", () => {
            const role = createRole("role:test", "Test", "Desc");
            expect(role.capabilities).toEqual([]);
        });

        it("should default contextRules to empty array", () => {
            const role = createRole("role:test", "Test", "Desc");
            expect(role.contextRules).toEqual([]);
        });

        it("should default metadata to empty object", () => {
            const role = createRole("role:test", "Test", "Desc");
            expect(role.metadata).toEqual({});
        });

        it("should make parentRole optional", () => {
            const role = createRole("role:test", "Test", "Desc");
            expect(role.parentRole).toBeUndefined();
        });
    });

    describe("RoleDefinition.hasCapability", () => {
        it("should return true for existing capability", () => {
            const cap = createCapability("cap:exists", "Exists", "Desc");
            const role = createRole("role:test", "Test", "Desc", [cap]);

            expect(role.hasCapability("cap:exists")).toBe(true);
        });

        it("should return false for non-existing capability", () => {
            const cap = createCapability("cap:exists", "Exists", "Desc");
            const role = createRole("role:test", "Test", "Desc", [cap]);

            expect(role.hasCapability("cap:missing")).toBe(false);
        });

        it("should return false when no capabilities", () => {
            const role = createRole("role:test", "Test", "Desc");
            expect(role.hasCapability("cap:any")).toBe(false);
        });
    });

    describe("RoleDefinition.getEffectiveContextRules", () => {
        it("should return role context rules", () => {
            const rule = createContextRule("path", "read");
            const role = createRole("role:test", "Test", "Desc", [], [rule]);

            expect(role.getEffectiveContextRules()).toEqual([rule]);
        });

        it("should return empty array when no rules", () => {
            const role = createRole("role:test", "Test", "Desc");
            expect(role.getEffectiveContextRules()).toEqual([]);
        });
    });

    describe("SystemRoles", () => {
        it("should have expected system roles", () => {
            expect(SystemRoles.ADMIN).toBe("role:admin");
            expect(SystemRoles.AGENT).toBe("role:agent");
            expect(SystemRoles.USER).toBe("role:user");
            expect(SystemRoles.OBSERVER).toBe("role:observer");
        });
    });

    describe("SystemCapabilities", () => {
        it("should have expected system capabilities", () => {
            expect(SystemCapabilities.READ_CONTEXT).toBe("cap:read-context");
            expect(SystemCapabilities.WRITE_CONTEXT).toBe("cap:write-context");
            expect(SystemCapabilities.TRAVERSE_GRAPH).toBe(
                "cap:traverse-graph",
            );
            expect(SystemCapabilities.MODIFY_GRAPH).toBe("cap:modify-graph");
            expect(SystemCapabilities.SEND_MESSAGES).toBe("cap:send-messages");
            expect(SystemCapabilities.RECEIVE_MESSAGES).toBe(
                "cap:receive-messages",
            );
            expect(SystemCapabilities.DISCOVER_AGENTS).toBe(
                "cap:discover-agents",
            );
            expect(SystemCapabilities.DISCOVER_KNOWLEDGE).toBe(
                "cap:discover-knowledge",
            );
            expect(SystemCapabilities.QUERY_REMOTE_CONTEXT).toBe(
                "cap:query-remote-context",
            );
            expect(SystemCapabilities.DISCOVER_PEERS).toBe(
                "cap:discover-peers",
            );
        });
    });
});
