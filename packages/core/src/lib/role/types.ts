import { z } from "zod";
import type { CapabilityId, Metadata, RoleId } from "../types";
import { CapabilityIdSchema, MetadataSchema, RoleIdSchema } from "../types";

/**
 * Role types and schemas.
 *
 * @module role/types
 */

/**
 * Zod schema for Capability validation.
 */
export const CapabilitySchema = z.object({
    id: CapabilityIdSchema,
    name: z.string().min(1),
    description: z.string(),
    metadata: MetadataSchema,
});

/**
 * Zod schema for ContextRule validation.
 */
export const ContextRuleSchema = z.object({
    path: z.string(),
    access: z.enum(["read", "write", "none"]),
    conditions: z.array(z.string()).optional(),
});

/**
 * Zod schema for RoleDefinition validation.
 */
export const RoleDefinitionSchema = z.object({
    id: RoleIdSchema,
    name: z.string().min(1),
    description: z.string(),
    parentRole: RoleIdSchema.optional(),
    capabilities: z.array(CapabilitySchema),
    contextRules: z.array(ContextRuleSchema),
    metadata: MetadataSchema,
});

/**
 * Defines a specific capability that can be granted to a role.
 */
export interface Capability {
    readonly id: CapabilityId;
    readonly name: string;
    readonly description: string;
    readonly metadata: Metadata;
}

/**
 * Rules that control how context data can be accessed.
 */
export interface ContextRule {
    readonly path: string;
    readonly access: "read" | "write" | "none";
    readonly conditions?: readonly string[];
}

/**
 * Defines a role in the graph context protocol.
 * Roles control permissions and context access.
 */
export interface RoleDefinition {
    readonly id: RoleId;
    readonly name: string;
    readonly description: string;
    readonly parentRole?: RoleId;
    readonly capabilities: readonly Capability[];
    readonly contextRules: readonly ContextRule[];
    readonly metadata: Metadata;

    /**
     * Checks if this role has a specific capability.
     *
     * @param capabilityId - The capability to check
     * @returns True if the role has the capability
     */
    hasCapability(capabilityId: CapabilityId): boolean;

    /**
     * Gets the effective context rules including inherited ones.
     *
     * @returns Array of all applicable context rules
     */
    getEffectiveContextRules(): readonly ContextRule[];
}

/**
 * Predefined system roles.
 */
export const SystemRoles = {
    ADMIN: "role:admin",
    AGENT: "role:agent",
    USER: "role:user",
    OBSERVER: "role:observer",
} as const;

/**
 * Predefined system capabilities.
 */
export const SystemCapabilities = {
    READ_CONTEXT: "cap:read-context",
    WRITE_CONTEXT: "cap:write-context",
    TRAVERSE_GRAPH: "cap:traverse-graph",
    MODIFY_GRAPH: "cap:modify-graph",
    SEND_MESSAGES: "cap:send-messages",
    RECEIVE_MESSAGES: "cap:receive-messages",
} as const;
