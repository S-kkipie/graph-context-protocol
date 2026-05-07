import { z } from "zod";
import type { CapabilityId, Metadata, RoleId } from "../types";
import { CapabilityIdSchema, MetadataSchema } from "../types";
import type { Capability, ContextRule, RoleDefinition } from "./types";
import { RoleDefinitionSchema } from "./types";

/**
 * Role implementation functions.
 *
 * @module role/implementation
 */

/**
 * Input schema for createCapability function.
 */
export const CreateCapabilityInputSchema = z.object({
    id: CapabilityIdSchema,
    name: z.string().min(1),
    description: z.string(),
    metadata: MetadataSchema.default({}),
});

/**
 * Creates a new capability with validation.
 *
 * @param id - Unique identifier for the capability
 * @param name - Human-readable name
 * @param description - Description of what the capability allows
 * @param metadata - Optional metadata
 * @returns A new Capability instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createCapability(
    id: CapabilityId,
    name: string,
    description: string,
    metadata: Metadata = {},
): Capability {
    const input = CreateCapabilityInputSchema.parse({
        id,
        name,
        description,
        metadata,
    });

    return {
        id: input.id,
        name: input.name,
        description: input.description,
        metadata: input.metadata,
    };
}

/**
 * Input schema for createContextRule function.
 */
export const CreateContextRuleInputSchema = z.object({
    path: z.string(),
    access: z.enum(["read", "write", "none"]),
    conditions: z.array(z.string()).optional(),
});

/**
 * Creates a new context rule with validation.
 *
 * @param path - Path pattern for the context data
 * @param access - Type of access allowed
 * @param conditions - Optional conditions that must be met
 * @returns A new ContextRule instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createContextRule(
    path: string,
    access: "read" | "write" | "none",
    conditions?: readonly string[],
): ContextRule {
    const input = CreateContextRuleInputSchema.parse({
        path,
        access,
        conditions,
    });

    return {
        path: input.path,
        access: input.access,
        conditions: input.conditions,
    };
}

/**
 * Creates a new role definition.
 *
 * @param id - Unique identifier for the role
 * @param name - Human-readable name
 * @param description - Description of the role
 * @param capabilities - Capabilities granted to this role
 * @param contextRules - Rules for context access
 * @param parentRole - Optional parent role to inherit from
 * @param metadata - Optional metadata
 * @returns A new RoleDefinition instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createRole(
    id: RoleId,
    name: string,
    description: string,
    capabilities: readonly Capability[] = [],
    contextRules: readonly ContextRule[] = [],
    parentRole?: RoleId,
    metadata: Metadata = {},
): RoleDefinition {
    const input = RoleDefinitionSchema.parse({
        id,
        name,
        description,
        capabilities,
        contextRules,
        parentRole,
        metadata,
    });

    return {
        id: input.id,
        name: input.name,
        description: input.description,
        parentRole: input.parentRole,
        capabilities: input.capabilities,
        contextRules: input.contextRules,
        metadata: input.metadata,
        hasCapability(capabilityId: CapabilityId): boolean {
            return input.capabilities.some((cap) => cap.id === capabilityId);
        },
        getEffectiveContextRules(): readonly ContextRule[] {
            return input.contextRules;
        },
    };
}
