import { z } from "zod";

/**
 * Common base types and identifiers used throughout the Graph Context Protocol.
 *
 * @module types
 */

/**
 * Zod schema for NodeId validation.
 */
export const NodeIdSchema = z.string().min(1);

/**
 * Zod schema for EdgeId validation.
 */
export const EdgeIdSchema = z.string().min(1);

/**
 * Zod schema for GraphId validation.
 */
export const GraphIdSchema = z.string().min(1);

/**
 * Zod schema for ContextId validation.
 */
export const ContextIdSchema = z.string().min(1);

/**
 * Zod schema for RoleId validation.
 */
export const RoleIdSchema = z.string().min(1);

/**
 * Zod schema for CapabilityId validation.
 */
export const CapabilityIdSchema = z.string().min(1);

/**
 * Zod schema for MessageId validation.
 */
export const MessageIdSchema = z.string().min(1);

/**
 * Zod schema for Timestamp validation (ISO 8601 format).
 */
export const TimestampSchema = z.string().datetime();

/**
 * Zod schema for Metadata validation.
 */
export const MetadataSchema = z.record(z.string(), z.unknown());

/**
 * Unique identifier for a node in the graph.
 */
export type NodeId = z.infer<typeof NodeIdSchema>;

/**
 * Unique identifier for an edge in the graph.
 */
export type EdgeId = z.infer<typeof EdgeIdSchema>;

/**
 * Unique identifier for a graph instance.
 */
export type GraphId = z.infer<typeof GraphIdSchema>;

/**
 * Unique identifier for a context instance.
 */
export type ContextId = z.infer<typeof ContextIdSchema>;

/**
 * Unique identifier for a role definition.
 */
export type RoleId = z.infer<typeof RoleIdSchema>;

/**
 * Unique identifier for a capability.
 */
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;

/**
 * Unique identifier for a message in the protocol.
 */
export type MessageId = z.infer<typeof MessageIdSchema>;

/**
 * Timestamp in ISO 8601 format.
 */
export type Timestamp = z.infer<typeof TimestampSchema>;

/**
 * Generic metadata record that can be attached to various entities.
 */
export type Metadata = z.infer<typeof MetadataSchema>;
