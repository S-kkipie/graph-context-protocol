import { z } from "zod";
import type { RoleDefinition } from "../role/types";
import type { EdgeId, Metadata, NodeId } from "../types";
import { EdgeIdSchema, MetadataSchema, NodeIdSchema } from "../types";
import type { EdgeType, GraphEdge, GraphNode } from "./types";
import { EdgeTypeSchema } from "./types";

/**
 * Graph implementation functions.
 *
 * @module graph/implementation
 */

/**
 * Input schema for createNode function.
 */
export const CreateNodeInputSchema = z.object({
    id: NodeIdSchema,
    metadata: MetadataSchema.default({}),
});

/**
 * Creates a new graph node with validation.
 *
 * @param id - Unique identifier for the node
 * @param role - Role definition for the node
 * @param metadata - Optional metadata
 * @returns A new GraphNode instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createNode(
    id: NodeId,
    role: RoleDefinition,
    metadata: Metadata = {},
): GraphNode {
    const input = CreateNodeInputSchema.parse({ id, metadata });
    const createdAt = new Date().toISOString();

    return {
        id: input.id,
        role,
        metadata: input.metadata,
        createdAt,
        withRole(newRole: RoleDefinition): GraphNode {
            return createNode(id, newRole, metadata);
        },
        withMetadata(newMetadata: Metadata): GraphNode {
            return createNode(id, role, { ...metadata, ...newMetadata });
        },
    };
}

/**
 * Input schema for createEdge function.
 */
export const CreateEdgeInputSchema = z.object({
    id: EdgeIdSchema,
    source: NodeIdSchema,
    target: NodeIdSchema,
    type: EdgeTypeSchema,
    metadata: MetadataSchema.default({}),
    bidirectional: z.boolean().default(false),
});

/**
 * Creates a new graph edge with validation.
 *
 * @param id - Unique identifier for the edge
 * @param source - Source node ID
 * @param target - Target node ID
 * @param type - Type of relationship
 * @param metadata - Optional metadata
 * @param bidirectional - Whether the edge is bidirectional
 * @returns A new GraphEdge instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createEdge(
    id: EdgeId,
    source: NodeId,
    target: NodeId,
    type: EdgeType,
    metadata: Metadata = {},
    bidirectional = false,
): GraphEdge {
    const input = CreateEdgeInputSchema.parse({
        id,
        source,
        target,
        type,
        metadata,
        bidirectional,
    });

    return {
        id: input.id,
        source: input.source,
        target: input.target,
        type: input.type,
        metadata: input.metadata,
        bidirectional: input.bidirectional,
        createdAt: new Date().toISOString(),
    };
}
