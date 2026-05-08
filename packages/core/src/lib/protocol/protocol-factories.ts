import type { GraphContext } from "../context/context-types";
import type { MessageId, NodeId } from "../types";
import type {
    MessageHeader,
    MessageOptions,
    MessageType,
    ProtocolMessage,
} from "./protocol-types";

/**
 * Protocol factory functions.
 *
 * @module protocol/protocol-factories
 */

/**
 * Creates a message header.
 *
 * @param messageId - Unique message identifier
 * @param source - Source node ID
 * @param target - Target node ID
 * @param type - Message type
 * @param options - Optional message options
 * @returns A new MessageHeader instance
 */
export function createMessageHeader(
    messageId: MessageId,
    source: NodeId,
    target: NodeId,
    type: MessageType,
    options: MessageOptions = {},
): MessageHeader {
    return {
        messageId,
        correlationId: options.correlationId,
        source,
        target,
        type,
        priority: options.priority ?? "normal",
        timestamp: new Date().toISOString(),
        ttl: options.ttl ?? 60,
        metadata: options.metadata ?? {},
    };
}

/**
 * Creates a protocol message.
 *
 * @param header - Message header
 * @param context - Current graph context
 * @param payload - Message payload data
 * @returns A new ProtocolMessage instance
 */
export function createProtocolMessage(
    header: MessageHeader,
    context: GraphContext,
    payload: unknown,
): ProtocolMessage {
    return {
        header,
        context,
        payload,
        provenance: [
            {
                nodeId: header.source,
                timestamp: header.timestamp,
                action: "received",
            },
        ],
    };
}

/**
 * Adds a provenance entry to a message.
 *
 * @param message - The message to update
 * @param nodeId - The node processing the message
 * @param action - The action taken
 * @returns A new ProtocolMessage with updated provenance
 */
export function addProvenance(
    message: ProtocolMessage,
    nodeId: NodeId,
    action: "received" | "processed" | "forwarded",
): ProtocolMessage {
    return {
        ...message,
        provenance: [
            ...message.provenance,
            {
                nodeId,
                timestamp: new Date().toISOString(),
                action,
            },
        ],
    };
}

/**
 * Checks if a message has expired based on TTL.
 *
 * @param message - The message to check
 * @returns True if the message has expired
 */
export function isMessageExpired(message: ProtocolMessage): boolean {
    const now = Date.now();
    const created = new Date(message.header.timestamp).getTime();
    const ttlMs = message.header.ttl * 1000;

    return now - created > ttlMs;
}
