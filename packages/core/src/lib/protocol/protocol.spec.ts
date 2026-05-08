import { describe, expect, it } from "vitest";
import type { GraphContext } from "../context/context-types";
import type { RoleDefinition } from "../role/role-types";
import {
    addProvenance,
    createMessageHeader,
    createProtocolMessage,
    isMessageExpired,
    type MessagePriority,
    type MessageType,
} from "./index";

// Mock context for testing
const createMockContext = (): GraphContext => ({
    id: "ctx:test",
    graphId: "graph:test",
    currentNode: "node:source",
    accumulatedData: {},
    role: {
        id: "role:test",
        name: "Test Role",
        description: "A test role",
        capabilities: [],
        contextRules: [],
        metadata: {},
        hasCapability: () => false,
        getEffectiveContextRules: () => [],
    } as RoleDefinition,
    metadata: {},
    createdAt: new Date().toISOString(),
    path: ["node:source"],
});

describe("protocol module", () => {
    describe("createMessageHeader", () => {
        it("should create a header with all required fields", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "context-request",
            );

            expect(header.messageId).toBe("msg:1");
            expect(header.source).toBe("node:source");
            expect(header.target).toBe("node:target");
            expect(header.type).toBe("context-request");
        });

        it("should set default priority to 'normal'", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "notification",
            );
            expect(header.priority).toBe("normal");
        });

        it("should set default ttl to 60 seconds", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "notification",
            );
            expect(header.ttl).toBe(60);
        });

        it("should set default metadata to empty object", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "notification",
            );
            expect(header.metadata).toEqual({});
        });

        it("should set timestamp to current time", () => {
            const before = Date.now();
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "notification",
            );
            const after = Date.now();

            const timestamp = new Date(header.timestamp).getTime();
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        it("should apply custom options", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "action-request",
                {
                    correlationId: "corr:123",
                    priority: "high",
                    ttl: 120,
                    metadata: { key: "value" },
                },
            );

            expect(header.correlationId).toBe("corr:123");
            expect(header.priority).toBe("high");
            expect(header.ttl).toBe(120);
            expect(header.metadata).toEqual({ key: "value" });
        });

        it("should accept all valid message types", () => {
            const types: MessageType[] = [
                "context-request",
                "context-response",
                "action-request",
                "action-response",
                "notification",
                "error",
            ];

            for (const type of types) {
                const header = createMessageHeader(
                    "msg:1",
                    "node:source",
                    "node:target",
                    type,
                );
                expect(header.type).toBe(type);
            }
        });

        it("should accept all valid priority levels", () => {
            const priorities: MessagePriority[] = [
                "low",
                "normal",
                "high",
                "critical",
            ];

            for (const priority of priorities) {
                const header = createMessageHeader(
                    "msg:1",
                    "node:source",
                    "node:target",
                    "notification",
                    { priority },
                );
                expect(header.priority).toBe(priority);
            }
        });
    });

    describe("createProtocolMessage", () => {
        it("should create a message with header, context, and payload", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "context-request",
            );
            const context = createMockContext();
            const payload = { data: "test" };

            const message = createProtocolMessage(header, context, payload);

            expect(message.header).toBe(header);
            expect(message.context).toBe(context);
            expect(message.payload).toBe(payload);
        });

        it("should create initial provenance from header source", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "context-request",
            );
            const context = createMockContext();

            const message = createProtocolMessage(header, context, {});

            expect(message.provenance).toHaveLength(1);
            expect(message.provenance[0].nodeId).toBe("node:source");
            expect(message.provenance[0].action).toBe("received");
            expect(message.provenance[0].timestamp).toBe(header.timestamp);
        });
    });

    describe("addProvenance", () => {
        it("should return a new message with updated provenance", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "context-request",
            );
            const context = createMockContext();
            const message = createProtocolMessage(header, context, {});

            const updatedMessage = addProvenance(
                message,
                "node:intermediate",
                "forwarded",
            );

            expect(updatedMessage).not.toBe(message);
            expect(updatedMessage.provenance).toHaveLength(2);
            expect(updatedMessage.provenance[0]).toEqual(message.provenance[0]);
            expect(updatedMessage.provenance[1].nodeId).toBe(
                "node:intermediate",
            );
            expect(updatedMessage.provenance[1].action).toBe("forwarded");
        });

        it("should accept all valid actions", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "context-request",
            );
            const context = createMockContext();
            const message = createProtocolMessage(header, context, {});

            const actions = ["received", "processed", "forwarded"] as const;

            for (const action of actions) {
                const updated = addProvenance(message, "node:1", action);
                const lastEntry =
                    updated.provenance[updated.provenance.length - 1];
                expect(lastEntry.action).toBe(action);
            }
        });

        it("should set timestamp to current time", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "context-request",
            );
            const context = createMockContext();
            const message = createProtocolMessage(header, context, {});

            const before = Date.now();
            const updated = addProvenance(message, "node:1", "processed");
            const after = Date.now();

            const lastEntry = updated.provenance[updated.provenance.length - 1];
            const timestamp = new Date(lastEntry.timestamp).getTime();
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });
    });

    describe("isMessageExpired", () => {
        it("should return false for fresh messages", () => {
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "notification",
                { ttl: 3600 }, // 1 hour
            );
            const context = createMockContext();
            const message = createProtocolMessage(header, context, {});

            expect(isMessageExpired(message)).toBe(false);
        });

        it("should return true for expired messages", () => {
            // Create a message with a timestamp in the past
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "notification",
                { ttl: 1 }, // 1 second TTL
            );
            const context = createMockContext();
            const message = createProtocolMessage(header, context, {});

            // Simulate time passing by manipulating the timestamp
            const expiredMessage = {
                ...message,
                header: {
                    ...message.header,
                    timestamp: new Date(Date.now() - 2000).toISOString(), // 2 seconds ago
                },
            };

            expect(isMessageExpired(expiredMessage)).toBe(true);
        });

        it("should handle messages at the boundary of expiration", () => {
            // Create message with very short TTL (expired immediately after creation)
            const header = createMessageHeader(
                "msg:1",
                "node:source",
                "node:target",
                "notification",
                { ttl: 0.001 }, // Very short TTL (1ms)
            );
            const context = createMockContext();
            const message = createProtocolMessage(header, context, {});

            // Wait a bit to ensure expiration
            const start = Date.now();
            while (Date.now() - start < 2) {
                // Busy wait for 2ms
            }

            expect(isMessageExpired(message)).toBe(true);
        });
    });
});
