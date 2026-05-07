/**
 * Connection manager implementation.
 *
 * @module connection/implementation
 */

import { fail, succeed } from "@graph-context-protocol/core";
import { createServerError } from "../errors.js";
import type { ConnectionId, SessionId } from "../types.js";
import type {
    Connection,
    ConnectionManager,
    ConnectionQuery,
    ConnectionSnapshot,
    ConnectionStatus,
    OpenConnectionInput,
    Session,
} from "./types.js";

const connectionStatuses: readonly ConnectionStatus[] = [
    "connecting",
    "authenticated",
    "active",
    "idle",
    "draining",
    "closed",
    "failed",
];

const terminalStatuses = new Set<ConnectionStatus>(["closed", "failed"]);
const inactiveStatuses = new Set<ConnectionStatus>([
    "draining",
    "closed",
    "failed",
]);

/**
 * Creates a connection manager.
 *
 * State updates clone the underlying maps before replacing the manager's current
 * state, so snapshots and previously returned connection objects remain immutable.
 *
 * @returns Connection manager instance
 */
export function createConnectionManager(): ConnectionManager {
    let connections: ReadonlyMap<ConnectionId, Connection> = new Map();
    let sessions: ReadonlyMap<SessionId, Session> = new Map();
    let nextConnectionSequence = 1;

    return {
        open(input: OpenConnectionInput) {
            if (!input.transportId) {
                return fail(
                    createServerError(
                        "validation-error",
                        "Transport ID is required",
                    ),
                );
            }

            const duplicateConnection = findDuplicateConnection(
                connections,
                input,
            );
            if (duplicateConnection) {
                return fail(
                    createServerError("conflict", "Connection already exists", {
                        metadata: { connectionId: duplicateConnection.id },
                    }),
                );
            }

            const generated = generateConnectionId(
                connections,
                nextConnectionSequence,
            );
            nextConnectionSequence = generated.nextSequence;

            const now = currentTimestamp();
            const connection: Connection = {
                id: generated.id,
                transportId: input.transportId,
                externalAgentId: input.externalAgentId,
                status: "connecting",
                connectedAt: now,
                lastSeenAt: now,
                metadata: input.metadata ?? {},
            };

            const nextConnections = new Map(connections);
            nextConnections.set(connection.id, connection);
            connections = nextConnections;

            return succeed(connection);
        },

        authenticate(connectionId: ConnectionId, session: Session) {
            const connection = connections.get(connectionId);
            if (!connection) {
                return failConnectionNotFound(connectionId);
            }

            if (session.connectionId !== connectionId) {
                return fail(
                    createServerError(
                        "validation-error",
                        "Session connection ID does not match",
                        {
                            metadata: {
                                connectionId,
                                sessionConnectionId: session.connectionId,
                            },
                        },
                    ),
                );
            }

            if (
                connection.status !== "connecting" &&
                connection.status !== "authenticated"
            ) {
                return failInvalidTransition(connection, "authenticate");
            }

            const existingSession = sessions.get(session.id);
            if (
                existingSession &&
                existingSession.connectionId !== connectionId
            ) {
                return fail(
                    createServerError(
                        "conflict",
                        "Session is already bound to another connection",
                        {
                            metadata: {
                                sessionId: session.id,
                                connectionId: existingSession.connectionId,
                            },
                        },
                    ),
                );
            }

            const updatedConnection: Connection = {
                ...connection,
                externalAgentId:
                    connection.externalAgentId ?? session.principal.agentId,
                sessionId: session.id,
                status: "authenticated",
                lastSeenAt: currentTimestamp(),
            };

            replaceConnection(updatedConnection);
            replaceSession(session);

            return succeed(updatedConnection);
        },

        bindSession(connectionId: ConnectionId, sessionId: SessionId) {
            const connection = connections.get(connectionId);
            if (!connection) {
                return failConnectionNotFound(connectionId);
            }

            const session = sessions.get(sessionId);
            if (!session) {
                return fail(
                    createServerError("not-found", "Session not found", {
                        metadata: { sessionId },
                    }),
                );
            }

            if (session.connectionId !== connectionId) {
                return fail(
                    createServerError(
                        "conflict",
                        "Session belongs to another connection",
                        {
                            metadata: {
                                sessionId,
                                connectionId: session.connectionId,
                            },
                        },
                    ),
                );
            }

            if (connection.sessionId && connection.sessionId !== sessionId) {
                return fail(
                    createServerError(
                        "conflict",
                        "Connection already has a different session",
                        {
                            metadata: {
                                connectionId,
                                sessionId: connection.sessionId,
                            },
                        },
                    ),
                );
            }

            if (
                connection.status !== "authenticated" &&
                connection.status !== "active"
            ) {
                return failInvalidTransition(connection, "bind session");
            }

            const updatedConnection: Connection = {
                ...connection,
                sessionId,
                status: "active",
                lastSeenAt: currentTimestamp(),
            };

            replaceConnection(updatedConnection);

            return succeed(updatedConnection);
        },

        heartbeat(connectionId: ConnectionId) {
            const connection = connections.get(connectionId);
            if (!connection) {
                return failConnectionNotFound(connectionId);
            }

            if (inactiveStatuses.has(connection.status)) {
                return failInvalidTransition(connection, "heartbeat");
            }

            const updatedConnection: Connection = {
                ...connection,
                status:
                    connection.status === "authenticated" ||
                    connection.status === "idle"
                        ? "active"
                        : connection.status,
                lastSeenAt: currentTimestamp(),
            };

            replaceConnection(updatedConnection);

            return succeed(updatedConnection);
        },

        close(connectionId: ConnectionId) {
            const connection = connections.get(connectionId);
            if (!connection) {
                return failConnectionNotFound(connectionId);
            }

            if (connection.status === "closed") {
                return succeed(connection);
            }

            const updatedConnection: Connection = {
                ...connection,
                status: "closed",
                lastSeenAt: currentTimestamp(),
            };

            replaceConnection(updatedConnection);
            if (connection.sessionId) {
                removeSession(connection.sessionId);
            }

            return succeed(updatedConnection);
        },

        get(connectionId: ConnectionId) {
            return connections.get(connectionId);
        },

        list(query?: ConnectionQuery) {
            return Array.from(connections.values()).filter((connection) =>
                matchesQuery(connection, query),
            );
        },

        snapshot(): ConnectionSnapshot {
            const connectionsByStatus = new Map<ConnectionStatus, number>();
            for (const status of connectionStatuses) {
                connectionsByStatus.set(status, 0);
            }

            for (const connection of connections.values()) {
                connectionsByStatus.set(
                    connection.status,
                    (connectionsByStatus.get(connection.status) ?? 0) + 1,
                );
            }

            return {
                totalConnections: connections.size,
                totalSessions: sessions.size,
                connectionsByStatus,
            };
        },
    };

    function replaceConnection(connection: Connection): void {
        const nextConnections = new Map(connections);
        nextConnections.set(connection.id, connection);
        connections = nextConnections;
    }

    function replaceSession(session: Session): void {
        const nextSessions = new Map(sessions);
        nextSessions.set(session.id, session);
        sessions = nextSessions;
    }

    function removeSession(sessionId: SessionId): void {
        const nextSessions = new Map(sessions);
        nextSessions.delete(sessionId);
        sessions = nextSessions;
    }
}

function matchesQuery(
    connection: Connection,
    query?: ConnectionQuery,
): boolean {
    if (!query) {
        return true;
    }

    return (
        matchesValue(connection.transportId, query.transportId) &&
        matchesValue(connection.externalAgentId, query.externalAgentId) &&
        matchesValue(connection.sessionId, query.sessionId) &&
        matchesValue(connection.status, query.status)
    );
}

function matchesValue<T>(
    value: T | undefined,
    expected: T | undefined,
): boolean {
    return expected === undefined || value === expected;
}

function findDuplicateConnection(
    connections: ReadonlyMap<ConnectionId, Connection>,
    input: OpenConnectionInput,
): Connection | undefined {
    if (!input.externalAgentId) {
        return undefined;
    }

    for (const connection of connections.values()) {
        if (
            connection.transportId === input.transportId &&
            connection.externalAgentId === input.externalAgentId &&
            !terminalStatuses.has(connection.status)
        ) {
            return connection;
        }
    }

    return undefined;
}

function generateConnectionId(
    connections: ReadonlyMap<ConnectionId, Connection>,
    sequence: number,
): { readonly id: ConnectionId; readonly nextSequence: number } {
    let nextSequence = sequence;
    let id: ConnectionId = `connection:${nextSequence}`;

    while (connections.has(id)) {
        nextSequence += 1;
        id = `connection:${nextSequence}`;
    }

    return { id, nextSequence: nextSequence + 1 };
}

function currentTimestamp(): string {
    return new Date().toISOString();
}

function failConnectionNotFound(connectionId: ConnectionId) {
    return fail(
        createServerError("not-found", "Connection not found", {
            metadata: { connectionId },
        }),
    );
}

function failInvalidTransition(connection: Connection, operation: string) {
    return fail(
        createServerError(
            "connection-error",
            `Cannot ${operation} connection in ${connection.status} state`,
            {
                metadata: {
                    connectionId: connection.id,
                    status: connection.status,
                },
            },
        ),
    );
}
