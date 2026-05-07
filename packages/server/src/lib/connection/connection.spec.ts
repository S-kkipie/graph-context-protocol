import type { Result } from "@graph-context-protocol/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectionManager } from "./implementation.js";
import type { Connection, Session } from "./types.js";

const principal = {
    id: "principal:1",
    agentId: "external-agent:1",
    capabilities: ["cap:send-messages"],
    metadata: {},
};

describe("connection manager", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("should open connections in connecting state", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const manager = createConnectionManager();

        const connection = expectSuccess(
            manager.open({
                transportId: "transport:1",
                externalAgentId: "external-agent:1",
                metadata: { remoteAddress: "127.0.0.1" },
            }),
        );

        expect(connection).toEqual({
            id: "connection:1",
            transportId: "transport:1",
            externalAgentId: "external-agent:1",
            status: "connecting",
            connectedAt: "2026-01-01T00:00:00.000Z",
            lastSeenAt: "2026-01-01T00:00:00.000Z",
            metadata: { remoteAddress: "127.0.0.1" },
        });
        expect(manager.get(connection.id)).toEqual(connection);
        expect(manager.list()).toEqual([connection]);

        const snapshot = manager.snapshot();
        expect(snapshot.totalConnections).toBe(1);
        expect(snapshot.totalSessions).toBe(0);
        expect(snapshot.connectionsByStatus.get("connecting")).toBe(1);
    });

    it("should reject duplicate open connections for the same transport and external agent", () => {
        const manager = createConnectionManager();
        expectSuccess(
            manager.open({
                transportId: "transport:1",
                externalAgentId: "external-agent:1",
            }),
        );

        const duplicate = manager.open({
            transportId: "transport:1",
            externalAgentId: "external-agent:1",
        });

        expect(duplicate.success).toBe(false);
        if (!duplicate.success) {
            expect(duplicate.error.code).toBe("conflict");
            expect(duplicate.error.metadata?.connectionId).toBe("connection:1");
        }
    });

    it("should authenticate a connecting connection and store the session", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const manager = createConnectionManager();
        const connection = expectSuccess(
            manager.open({ transportId: "transport:1" }),
        );
        const session = createSession(connection.id);

        vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
        const authenticated = expectSuccess(
            manager.authenticate(connection.id, session),
        );

        expect(authenticated.status).toBe("authenticated");
        expect(authenticated.sessionId).toBe(session.id);
        expect(authenticated.externalAgentId).toBe("external-agent:1");
        expect(authenticated.lastSeenAt).toBe("2026-01-01T00:00:01.000Z");
        expect(manager.get(connection.id)).toEqual(authenticated);
        expect(manager.snapshot().totalSessions).toBe(1);
    });

    it("should bind authenticated sessions and transition to active", () => {
        const manager = createConnectionManager();
        const connection = expectSuccess(
            manager.open({ transportId: "transport:1" }),
        );
        const session = createSession(connection.id);
        expectSuccess(manager.authenticate(connection.id, session));

        const active = expectSuccess(
            manager.bindSession(connection.id, session.id),
        );

        expect(active.status).toBe("active");
        expect(active.sessionId).toBe(session.id);
        expect(manager.list({ sessionId: session.id })).toEqual([active]);
        expect(manager.list({ status: "active" })).toEqual([active]);
    });

    it("should reject session binding before authentication", () => {
        const manager = createConnectionManager();
        const connection = expectSuccess(
            manager.open({ transportId: "transport:1" }),
        );

        const result = manager.bindSession(connection.id, "session:missing");

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("not-found");
        }
    });

    it("should update lastSeenAt and keep active status on heartbeat", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const manager = createConnectionManager();
        const connection = expectSuccess(
            manager.open({ transportId: "transport:1" }),
        );
        const session = createSession(connection.id);
        expectSuccess(manager.authenticate(connection.id, session));
        expectSuccess(manager.bindSession(connection.id, session.id));

        vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
        const heartbeat = expectSuccess(manager.heartbeat(connection.id));

        expect(heartbeat.status).toBe("active");
        expect(heartbeat.lastSeenAt).toBe("2026-01-01T00:00:05.000Z");
    });

    it("should close connections and release bound sessions", () => {
        const manager = createConnectionManager();
        const connection = expectSuccess(
            manager.open({ transportId: "transport:1" }),
        );
        const session = createSession(connection.id);
        expectSuccess(manager.authenticate(connection.id, session));
        expectSuccess(manager.bindSession(connection.id, session.id));

        const closed = expectSuccess(manager.close(connection.id));

        expect(closed.status).toBe("closed");
        expect(manager.get(connection.id)).toEqual(closed);

        const snapshot = manager.snapshot();
        expect(snapshot.totalConnections).toBe(1);
        expect(snapshot.totalSessions).toBe(0);
        expect(snapshot.connectionsByStatus.get("closed")).toBe(1);

        const heartbeat = manager.heartbeat(connection.id);
        expect(heartbeat.success).toBe(false);
        if (!heartbeat.success) {
            expect(heartbeat.error.code).toBe("connection-error");
        }
    });
});

function createSession(connectionId: Connection["id"]): Session {
    return {
        id: "session:1",
        connectionId,
        principal,
        createdAt: "2026-01-01T00:00:00.000Z",
        metadata: {},
    };
}

function expectSuccess<T, E>(result: Result<T, E>): T {
    expect(result.success).toBe(true);
    if (!result.success) {
        throw new Error("Expected successful result");
    }

    return result.data;
}
