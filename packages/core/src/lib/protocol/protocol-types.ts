import type { GraphContext } from "../context/context-types";
import type { MessageId, Metadata, NodeId, Timestamp } from "../types";

/**
 * Protocol types.
 *
 * @module protocol/protocol-types
 */

/**
 * Priority levels for protocol messages.
 */
export type MessagePriority = "low" | "normal" | "high" | "critical";

/**
 * Types of protocol messages.
 */
export type MessageType =
    | "context-request"
    | "context-response"
    | "action-request"
    | "action-response"
    | "notification"
    | "error";

/**
 * Header containing routing and metadata for messages.
 */
export interface MessageHeader {
    readonly messageId: MessageId;
    readonly correlationId?: MessageId;
    readonly source: NodeId;
    readonly target: NodeId;
    readonly type: MessageType;
    readonly priority: MessagePriority;
    readonly timestamp: Timestamp;
    readonly ttl: number;
    readonly metadata: Metadata;
}

/**
 * Provenance tracking for message path.
 */
export interface MessageProvenance {
    readonly nodeId: NodeId;
    readonly timestamp: Timestamp;
    readonly action: "received" | "processed" | "forwarded";
}

/**
 * Protocol message structure.
 */
export interface ProtocolMessage {
    readonly header: MessageHeader;
    readonly context: GraphContext;
    readonly payload: unknown;
    readonly provenance: readonly MessageProvenance[];
}

/**
 * Options for creating a message.
 */
export interface MessageOptions {
    readonly correlationId?: MessageId;
    readonly priority?: MessagePriority;
    readonly ttl?: number;
    readonly metadata?: Metadata;
}
