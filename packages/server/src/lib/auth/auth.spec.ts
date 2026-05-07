import { createCapability, createRole } from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import {
    createAllowAllAuthProvider,
    createCapabilityAuthProvider,
    createStaticTokenAuthProvider,
} from "./implementation.js";
import type { Principal } from "./types.js";

const principal: Principal = {
    id: "principal:1",
    agentId: "external-agent:1",
    capabilities: ["cap:send-messages"],
    metadata: { source: "test" },
};

describe("auth providers", () => {
    describe("createAllowAllAuthProvider", () => {
        it("should authenticate any credentials", async () => {
            const provider = createAllowAllAuthProvider();

            const result = await provider.authenticate({
                type: "anonymous",
                value: "anything",
                metadata: { agentId: "external-agent:allow-all" },
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.id).toBe("principal:allow-all");
                expect(result.data.agentId).toBe("external-agent:allow-all");
            }
        });

        it("should return supplied principal credentials unchanged", async () => {
            const provider = createAllowAllAuthProvider();

            const result = await provider.authenticate({
                type: "principal",
                value: principal,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe(principal);
            }
        });

        it("should authorize every request", () => {
            const provider = createAllowAllAuthProvider();

            const result = provider.authorize(principal, { action: "connect" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.allowed).toBe(true);
            }
        });
    });

    describe("createStaticTokenAuthProvider", () => {
        it("should authenticate a known static token", async () => {
            const provider = createStaticTokenAuthProvider(
                new Map([["secret", principal]]),
            );

            const result = await provider.authenticate({
                type: "token",
                value: "secret",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe(principal);
            }
        });

        it("should reject non-token credentials", async () => {
            const provider = createStaticTokenAuthProvider(
                new Map([["secret", principal]]),
            );

            const result = await provider.authenticate({
                type: "password",
                value: "secret",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("auth-error");
            }
        });

        it("should reject unknown static tokens", async () => {
            const provider = createStaticTokenAuthProvider(
                new Map([["secret", principal]]),
            );

            const result = await provider.authenticate({
                type: "token",
                value: "wrong",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("auth-error");
            }
        });

        it("should authorize authenticated principals by default", () => {
            const provider = createStaticTokenAuthProvider(
                new Map([["secret", principal]]),
            );

            const result = provider.authorize(principal, {
                action: "send-message",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.allowed).toBe(true);
            }
        });
    });

    describe("createCapabilityAuthProvider", () => {
        it("should authorize when the principal has the required capability", () => {
            const provider = createCapabilityAuthProvider(
                new Map([["send-message", "cap:send-messages"]]),
            );

            const result = provider.authorize(principal, {
                action: "send-message",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.allowed).toBe(true);
            }
        });

        it("should authorize when the principal role has the required capability", () => {
            const role = createRole(
                "role:sender",
                "Sender",
                "Can send messages",
                [
                    createCapability(
                        "cap:role-send",
                        "Role Send",
                        "Can send through role",
                    ),
                ],
                [],
            );
            const provider = createCapabilityAuthProvider("cap:role-send");

            const result = provider.authorize(
                { ...principal, role, capabilities: [] },
                { action: "send-message" },
            );

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.allowed).toBe(true);
            }
        });

        it("should deny when the principal lacks a required capability", () => {
            const provider = createCapabilityAuthProvider({
                "query-knowledge": "cap:query-knowledge",
            });

            const result = provider.authorize(principal, {
                action: "query-knowledge",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.allowed).toBe(false);
                expect(result.data.reason).toContain("cap:query-knowledge");
            }
        });

        it("should preserve delegate authorization denials", () => {
            const provider = createCapabilityAuthProvider("cap:send-messages", {
                async authenticate() {
                    return { success: true, data: principal };
                },
                authorize() {
                    return {
                        success: true,
                        data: { allowed: false, reason: "blocked" },
                    };
                },
            });

            const result = provider.authorize(principal, {
                action: "send-message",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.allowed).toBe(false);
                expect(result.data.reason).toBe("blocked");
            }
        });
    });
});
