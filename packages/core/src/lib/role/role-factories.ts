import { z } from "zod";
import type { CapabilityId, Metadata, RoleId } from "../types";
import { CapabilityIdSchema, MetadataSchema } from "../types";
import type { Capability, ContextRule, RoleDefinition } from "./role-types";
import { RoleDefinitionSchema } from "./role-types";

/**
 * Role factory functions.
 *
 * @module role/role-factories
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
 * @param parentRole - Optional parent role to inherit from (RoleId or RoleDefinition)
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
    parentRole?: RoleId | RoleDefinition,
    metadata: Metadata = {},
): RoleDefinition {
    const parentDefinition: RoleDefinition | undefined =
        typeof parentRole === "object" ? parentRole : undefined;
    const parentRoleId: RoleId | undefined =
        typeof parentRole === "object" ? parentRole.id : parentRole;

    const input = RoleDefinitionSchema.parse({
        id,
        name,
        description,
        capabilities,
        contextRules,
        parentRole: parentRoleId,
        metadata,
    });

    // Guard against a degenerate self-parent (id === own id); deeper cycles are
    // structurally impossible because a parent must be constructed first.
    const safeParent =
        parentDefinition && parentDefinition.id !== input.id
            ? parentDefinition
            : undefined;

    return {
        id: input.id,
        name: input.name,
        description: input.description,
        parentRole: input.parentRole,
        capabilities: input.capabilities,
        contextRules: input.contextRules,
        metadata: input.metadata,
        hasCapability(capabilityId: CapabilityId): boolean {
            return this.getEffectiveCapabilities().some(
                (cap) => cap.id === capabilityId,
            );
        },
        getEffectiveCapabilities(): readonly Capability[] {
            return mergeCapabilitiesById(
                input.capabilities,
                safeParent ? safeParent.getEffectiveCapabilities() : [],
            );
        },
        getEffectiveContextRules(): readonly ContextRule[] {
            return mergeContextRulesByPath(
                input.contextRules,
                safeParent ? safeParent.getEffectiveContextRules() : [],
            );
        },
    };
}

/** Unions own + inherited capabilities, own-first, deduped by id. */
function mergeCapabilitiesById(
    own: readonly Capability[],
    inherited: readonly Capability[],
): readonly Capability[] {
    const result: Capability[] = [];
    const seen = new Set<CapabilityId>();
    for (const cap of [...own, ...inherited]) {
        if (!seen.has(cap.id)) {
            seen.add(cap.id);
            result.push(cap);
        }
    }
    return result;
}

/** Unions own + inherited context rules, own-first, deduped by path. */
function mergeContextRulesByPath(
    own: readonly ContextRule[],
    inherited: readonly ContextRule[],
): readonly ContextRule[] {
    const result: ContextRule[] = [];
    const seen = new Set<string>();
    for (const rule of [...own, ...inherited]) {
        if (!seen.has(rule.path)) {
            seen.add(rule.path);
            result.push(rule);
        }
    }
    return result;
}
