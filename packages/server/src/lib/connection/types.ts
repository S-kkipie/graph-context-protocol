/**
 * Connection and session state types.
 *
 * @module connection/types
 */

import type { Metadata, Result, Timestamp } from "@graph-context-protocol/core";
import type { Principal } from "../auth/types";
import type { ServerError } from "../errors";
import type {
    ConnectionId,
    ExternalAgentId,
    SessionId,
    TransportId,
} from "../types";

/**
 * Lifecycle status for a transport connection.
 */
export type ConnectionStatus =
    | "connecting"
    | "authenticated"
    | "active"
    | "idle"
    | "draining"
    | "closed"
    | "failed";

/**
 * Server-side connection state.
 */
export interface Connection {
    /** Unique connection identifier */
    readonly id: ConnectionId;
    /** Transport that owns the connection */
    readonly transportId: TransportId;
    /** External agent represented by the connection, if known */
    readonly externalAgentId?: ExternalAgentId;
    /** Authenticated session bound to the connection, if any */
    readonly sessionId?: SessionId;
    /** Current connection lifecycle status */
    readonly status: ConnectionStatus;
    /** Timestamp when the connection opened */
    readonly connectedAt: Timestamp;
    /** Timestamp of the most recent state update or heartbeat */
    readonly lastSeenAt: Timestamp;
    /** Additional connection metadata */
    readonly metadata: Metadata;
}

/**
 * Authenticated session bound to a connection.
 */
export interface Session {
    /** Unique session identifier */
    readonly id: SessionId;
    /** Connection that owns the session */
    readonly connectionId: ConnectionId;
    /** Authenticated principal for this session */
    readonly principal: Principal;
    /** Timestamp when the session was created */
    readonly createdAt: Timestamp;
    /** Optional session expiration timestamp */
    readonly expiresAt?: Timestamp;
    /** Additional session metadata */
    readonly metadata: Metadata;
}

/**
 * Input for opening a new connection.
 */
export interface OpenConnectionInput {
    /** Transport that owns the connection */
    readonly transportId: TransportId;
    /** External agent represented by the connection, if known */
    readonly externalAgentId?: ExternalAgentId;
    /** Additional connection metadata */
    readonly metadata?: Metadata;
}

/**
 * Filters for listing connections.
 */
export interface ConnectionQuery {
    /** Filter by transport */
    readonly transportId?: TransportId;
    /** Filter by external agent */
    readonly externalAgentId?: ExternalAgentId;
    /** Filter by bound session */
    readonly sessionId?: SessionId;
    /** Filter by connection status */
    readonly status?: ConnectionStatus;
}

/**
 * Aggregate connection manager state.
 */
export interface ConnectionSnapshot {
    /** Number of tracked connections */
    readonly totalConnections: number;
    /** Number of tracked sessions */
    readonly totalSessions: number;
    /** Connection counts grouped by status */
    readonly connectionsByStatus: ReadonlyMap<ConnectionStatus, number>;
}

/**
 * Manages connection and session state.
 */
export interface ConnectionManager {
    /**
     * Opens a new connection in the connecting state.
     *
     * @param input - Connection details
     * @returns Result containing the opened connection or server error
     */
    open(input: OpenConnectionInput): Result<Connection, ServerError>;

    /**
     * Authenticates a connection and stores its session.
     *
     * @param connectionId - Connection to authenticate
     * @param session - Session created for the authenticated principal
     * @returns Result containing the authenticated connection or server error
     */
    authenticate(
        connectionId: ConnectionId,
        session: Session,
    ): Result<Connection, ServerError>;

    /**
     * Binds an authenticated session and marks the connection active.
     *
     * @param connectionId - Connection to bind
     * @param sessionId - Session to bind
     * @returns Result containing the active connection or server error
     */
    bindSession(
        connectionId: ConnectionId,
        sessionId: SessionId,
    ): Result<Connection, ServerError>;

    /**
     * Records a heartbeat for a connection.
     *
     * @param connectionId - Connection that sent a heartbeat
     * @returns Result containing the updated connection or server error
     */
    heartbeat(connectionId: ConnectionId): Result<Connection, ServerError>;

    /**
     * Closes a connection and releases any bound session.
     *
     * @param connectionId - Connection to close
     * @returns Result containing the closed connection or server error
     */
    close(connectionId: ConnectionId): Result<Connection, ServerError>;

    /**
     * Gets a connection by ID.
     *
     * @param connectionId - Connection identifier
     * @returns Connection if found
     */
    get(connectionId: ConnectionId): Connection | undefined;

    /**
     * Lists connections matching an optional query.
     *
     * @param query - Optional connection filters
     * @returns Matching connections
     */
    list(query?: ConnectionQuery): readonly Connection[];

    /**
     * Gets aggregate connection and session counts.
     *
     * @returns Snapshot of current manager state
     */
    snapshot(): ConnectionSnapshot;
}
