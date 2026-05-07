/**
 * Transport abstraction types and validation schemas.
 *
 * @module transport/types
 */

import {
    type Metadata,
    MetadataSchema,
    type ProtocolMessage,
    type Result,
    type Timestamp,
    TimestampSchema,
} from "@graph-context-protocol/core";
import { z } from "zod";
import type { ServerError } from "../errors.js";
import type { ShutdownOptions } from "../lifecycle/types.js";
import {
    type ConnectionId,
    ConnectionIdSchema,
    type DeliveryReceipt,
    type OutboundMessageEnvelope,
    type SessionId,
    SessionIdSchema,
    type TransportId,
    TransportIdSchema,
    type Unsubscribe,
} from "../types.js";

/**
 * Runtime status for a transport.
 */
export type TransportStatus =
    | "idle"
    | "starting"
    | "listening"
    | "draining"
    | "stopped"
    | "failed";

/**
 * Zod schema for transport status validation.
 */
export const TransportStatusSchema = z.enum([
    "idle",
    "starting",
    "listening",
    "draining",
    "stopped",
    "failed",
]);

/**
 * Transport-normalized inbound protocol message.
 */
export interface TransportEnvelope {
    /** Transport that received the message */
    readonly transportId: TransportId;
    /** Connection associated with the message, if available */
    readonly connectionId?: ConnectionId;
    /** Authenticated session associated with the message, if available */
    readonly sessionId?: SessionId;
    /** Parsed protocol message */
    readonly message: ProtocolMessage;
    /** Timestamp when the envelope was received */
    readonly receivedAt: Timestamp;
    /** Additional envelope metadata */
    readonly metadata: Metadata;
}

/**
 * Listener invoked when a transport receives a message.
 */
export type TransportMessageListener = (
    envelope: TransportEnvelope,
) => void | Promise<void>;

/**
 * Transport interface used by the server runtime.
 */
export interface Transport {
    /** Transport identifier */
    readonly id: TransportId;
    /** Current transport status */
    readonly status: TransportStatus;
    /** Starts the transport */
    start(): Promise<Result<TransportSnapshot, ServerError>>;
    /** Stops the transport */
    stop(
        options?: ShutdownOptions,
    ): Promise<Result<TransportSnapshot, ServerError>>;
    /** Sends an outbound envelope */
    send(
        envelope: OutboundMessageEnvelope,
    ): Promise<Result<DeliveryReceipt, ServerError>>;
    /** Registers an inbound message listener */
    onMessage(listener: TransportMessageListener): Unsubscribe;
    /** Returns the current transport snapshot */
    snapshot(): TransportSnapshot;
}

/**
 * Snapshot of transport state.
 */
export interface TransportSnapshot {
    /** Transport identifier */
    readonly id: TransportId;
    /** Current transport status */
    readonly status: TransportStatus;
    /** Timestamp when the transport started listening */
    readonly startedAt?: Timestamp;
    /** Timestamp when the transport stopped */
    readonly stoppedAt?: Timestamp;
}

/**
 * Registry for managing transports as a group.
 */
export interface TransportRegistry {
    /** Registers a transport and returns a new registry */
    register(transport: Transport): Result<TransportRegistry, ServerError>;
    /** Gets a transport by ID */
    get(id: TransportId): Transport | undefined;
    /** Lists registered transports */
    list(): readonly Transport[];
    /** Starts all registered transports */
    startAll(): Promise<Result<readonly TransportSnapshot[], ServerError>>;
    /** Stops all registered transports */
    stopAll(
        options?: ShutdownOptions,
    ): Promise<Result<readonly TransportSnapshot[], ServerError>>;
}

/**
 * Structural schema for protocol messages transported by the server.
 */
export const ProtocolMessageSchema = z.custom<ProtocolMessage>(
    (value) =>
        typeof value === "object" &&
        value !== null &&
        "header" in value &&
        "context" in value &&
        "payload" in value &&
        "provenance" in value,
);

/**
 * Zod schema for transport envelopes.
 */
export const TransportEnvelopeSchema = z.object({
    transportId: TransportIdSchema,
    connectionId: ConnectionIdSchema.optional(),
    sessionId: SessionIdSchema.optional(),
    message: ProtocolMessageSchema,
    receivedAt: TimestampSchema,
    metadata: MetadataSchema,
});

/**
 * Zod schema for transport snapshots.
 */
export const TransportSnapshotSchema = z.object({
    id: TransportIdSchema,
    status: TransportStatusSchema,
    startedAt: TimestampSchema.optional(),
    stoppedAt: TimestampSchema.optional(),
});

/**
 * Zod schema for transport objects.
 */
export const TransportSchema = z.object({
    id: TransportIdSchema,
    status: TransportStatusSchema,
    start: z.custom<Transport["start"]>((value) => typeof value === "function"),
    stop: z.custom<Transport["stop"]>((value) => typeof value === "function"),
    send: z.custom<Transport["send"]>((value) => typeof value === "function"),
    onMessage: z.custom<Transport["onMessage"]>(
        (value) => typeof value === "function",
    ),
    snapshot: z.custom<Transport["snapshot"]>(
        (value) => typeof value === "function",
    ),
});

/**
 * Zod schema for transport message listeners.
 */
export const TransportMessageListenerSchema =
    z.custom<TransportMessageListener>((value) => typeof value === "function");
