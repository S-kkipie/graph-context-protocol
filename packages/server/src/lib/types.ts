/**
 * Base server types and identifiers.
 *
 * @module types
 */

import type {
    Metadata,
    NodeId,
    ProtocolMessage,
    Timestamp,
} from "@graph-context-protocol/core";
import { z } from "zod";

export type { ProtocolMessage };

/**
 * Server identifier.
 */
export type ServerId = string;

/**
 * Connection identifier.
 */
export type ConnectionId = string;

/**
 * Session identifier.
 */
export type SessionId = string;

/**
 * Transport identifier.
 */
export type TransportId = string;

/**
 * External knowledge source identifier.
 */
export type KnowledgeSourceId = string;

/**
 * External agent identifier.
 */
export type ExternalAgentId = string;

/**
 * Server runtime status.
 */
export type ServerStatus =
    | "idle"
    | "starting"
    | "ready"
    | "draining"
    | "stopping"
    | "stopped"
    | "failed";

/**
 * Zod schema for ServerId.
 */
export const ServerIdSchema = z.string().min(1);

/**
 * Zod schema for ConnectionId.
 */
export const ConnectionIdSchema = z.string().min(1);

/**
 * Zod schema for SessionId.
 */
export const SessionIdSchema = z.string().min(1);

/**
 * Zod schema for TransportId.
 */
export const TransportIdSchema = z.string().min(1);

/**
 * Zod schema for KnowledgeSourceId.
 */
export const KnowledgeSourceIdSchema = z.string().min(1);

/**
 * Zod schema for ExternalAgentId.
 */
export const ExternalAgentIdSchema = z.string().min(1);

/**
 * Zod schema for ServerStatus.
 */
export const ServerStatusSchema = z.enum([
    "idle",
    "starting",
    "ready",
    "draining",
    "stopping",
    "stopped",
    "failed",
]);

/**
 * Server configuration options.
 */
export interface ServerConfig {
    /** Unique server identifier */
    readonly id: ServerId;
    /** Local node ID this server represents */
    readonly localNodeId: NodeId;
    /** Graceful shutdown timeout in milliseconds */
    readonly shutdownTimeoutMs: number;
    /** Optional metadata */
    readonly metadata?: Metadata;
}

/**
 * Zod schema for ServerConfig validation.
 */
export const ServerConfigSchema = z.object({
    id: ServerIdSchema,
    localNodeId: z.string().min(1),
    shutdownTimeoutMs: z.number().int().positive().default(30000),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Inbound message envelope received from transport.
 */
export interface InboundMessageEnvelope {
    /** Transport that received the message */
    readonly transportId: TransportId;
    /** Connection ID if available */
    readonly connectionId?: ConnectionId;
    /** Session ID if authenticated */
    readonly sessionId?: SessionId;
    /** Raw message payload */
    readonly payload: unknown;
    /** When received */
    readonly receivedAt: Timestamp;
    /** Additional metadata */
    readonly metadata: Metadata;
}

/**
 * Outbound message envelope for sending via transport.
 */
export interface OutboundMessageEnvelope {
    /** Target transport */
    readonly transportId: TransportId;
    /** Target connection if direct */
    readonly connectionId?: ConnectionId;
    /** Message payload */
    readonly payload: unknown;
    /** When created */
    readonly createdAt: Timestamp;
    /** Additional metadata */
    readonly metadata: Metadata;
}

/**
 * Delivery receipt for sent messages.
 */
export interface DeliveryReceipt {
    /** Whether delivery was successful */
    readonly delivered: boolean;
    /** When delivery was attempted */
    readonly timestamp: Timestamp;
    /** Transport used */
    readonly transportId: TransportId;
    /** Connection if applicable */
    readonly connectionId?: ConnectionId;
    /** Error if delivery failed */
    readonly error?: string;
}

/**
 * Zod schema for DeliveryReceipt.
 */
export const DeliveryReceiptSchema = z.object({
    delivered: z.boolean(),
    timestamp: z.string().datetime(),
    transportId: TransportIdSchema,
    connectionId: ConnectionIdSchema.optional(),
    error: z.string().optional(),
});

/**
 * Unsubscribe function for listeners.
 */
export type Unsubscribe = () => void;
